import { renderHook, act } from '@testing-library/react';
import type { ChatMessage, AnalysisTaskAck, TaskSnapshot } from '../types/api';
import { resetToasts } from '../utils/toast';
import { installFakeEventSource, getLastEventSource } from '../test/fakeEventSource';

vi.mock('../services/constants', async () => {
  const actual = await vi.importActual<typeof import('../services/constants')>('../services/constants');
  return { ...actual, USE_ASYNC_ANALYZE: true };
});

vi.mock('../services/api', () => ({
  analyzeQuery: vi.fn(),
  submitAnalyzeAsync: vi.fn(),
  fetchTaskSnapshot: vi.fn(),
  taskEventStreamUrl: (tid: string) => `/stream/${tid}`,
}));

import { useMessageSending } from './useMessageSending';
import { submitAnalyzeAsync, fetchTaskSnapshot } from '../services/api';

const mockSubmit = vi.mocked(submitAnalyzeAsync);
const mockSnapshot = vi.mocked(fetchTaskSnapshot);

let uninstallES: () => void;

const baseParams = () => ({
  userId: 'alice' as string | null,
  sessionId: 'sess-1',
  messages: [] as ChatMessage[],
  isGuestMode: false,
  setMessages: vi.fn(),
  ensureRemoteSession: vi.fn().mockResolvedValue('sess-1'),
  commitSessionFromAnalyze: vi.fn(),
  onNeedLogin: vi.fn(),
});

function makeAck(): AnalysisTaskAck {
  return {
    trace_id: 'tr-async-1',
    status: 'queued',
    session_id: 'sess-1',
    user_message_id: 'u-msg-1',
    assistant_message_id: 'a-msg-1',
    poll_url: '/analyze/tasks/tr-async-1',
    stream_url: '/analyze/tasks/tr-async-1/events',
    created_at: '2026-04-14T10:00:00Z',
  };
}

function makeOkSnapshot(): TaskSnapshot {
  return {
    trace_id: 'tr-async-1',
    status: 'ok',
    session_id: 'sess-1',
    user_id: 'alice',
    created_at: '2026-04-14T10:00:00Z',
    result: {
      report_id: 'r-1',
      status: 'success',
      analysis_type: 'three_way_match',
      query: 'q',
      user_id: 'alice',
      session_id: 'sess-1',
      time_range: '',
      anomalies: [],
      supplier_kpis: [],
      summary: {},
      report_markdown: '## async ok',
      error: null,
      completed_tasks: [],
      failed_tasks: [],
      created_at: '2026-04-14T10:00:00Z',
      duration_ms: 2000,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetToasts();
  uninstallES = installFakeEventSource();
});

afterEach(() => {
  uninstallES();
});

describe('useMessageSending (async branch)', () => {
  it('submits ack, starts stream, updates message on done', async () => {
    mockSubmit.mockResolvedValue(makeAck());
    mockSnapshot.mockResolvedValue(makeOkSnapshot());

    const params = baseParams();
    const { result } = renderHook(() => useMessageSending(params));

    await act(async () => {
      await result.current.handleSend('分析订单异常');
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    // 乐观渲染 + ack 后 id/traceId 回填，至少 2 次 setMessages
    expect(params.setMessages.mock.calls.length).toBeGreaterThanOrEqual(2);

    // stream 打开
    const es = getLastEventSource();
    expect(es).toBeDefined();
    expect(es!.url).toContain('tr-async-1');

    // 推 done，等待 onDone 异步拉快照
    await act(async () => {
      es!.open();
      es!.emit('done', {
        type: 'done', trace_id: 'tr-async-1', ts: 'x', seq: 99,
        status: 'ok', duration_ms: 2000,
      });
      await vi.waitFor(() => expect(mockSnapshot).toHaveBeenCalled());
    });

    // 终态后 setMessages 又被调用至少一次（把 report_markdown 写入气泡）
    const lastCalls = params.setMessages.mock.calls.slice(-3);
    const applied = lastCalls.some(([updater]) => {
      if (typeof updater !== 'function') return false;
      const out = updater([
        { id: 'a-msg-1', role: 'assistant', content: '', timestamp: new Date(), status: 'sending' },
      ]);
      return out.some((m: ChatMessage) => m.content.includes('async ok') && m.status === 'success');
    });
    expect(applied).toBe(true);
  });

  it('submit failure stops loading and does not open stream', async () => {
    mockSubmit.mockRejectedValue(new Error('boom'));

    const params = baseParams();
    const { result } = renderHook(() => useMessageSending(params));

    await act(async () => {
      await result.current.handleSend('x');
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    // 提交失败不应该打开 SSE
    expect(getLastEventSource()).toBeUndefined();
  });
});
