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
  isSessionAlive: vi.fn().mockReturnValue(true),
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

  // 用户在 ack 返回期间删除了会话：handleSend 继续走到 registerStream+streams.start 会导致
  // 流绑到已删除的会话、永远无法 stop。isSessionAlive 在每个 await 后校验，这里断言流没启动。
  it('does not start stream if session deleted during submit await (send-then-delete race)', async () => {
    // submit ack 延迟到 test 显式 resolve，模拟后端慢响应
    let resolveSubmit!: (v: AnalysisTaskAck) => void;
    mockSubmit.mockImplementation(
      () => new Promise<AnalysisTaskAck>(r => { resolveSubmit = r; })
    );

    const params = baseParams();
    // ensureRemoteSession 返回时 session 还在；submit 返回前被删
    params.isSessionAlive = vi.fn()
      .mockReturnValueOnce(true)   // ensureRemoteSession 之后
      .mockReturnValue(false);     // submit ack 之后 → 已删

    const { result } = renderHook(() => useMessageSending(params));

    await act(async () => {
      const p = result.current.handleSend('x');
      // 先让 ensureRemoteSession 的微任务跑完，确保 submit 已被调用、resolveSubmit 已赋值
      await vi.waitFor(() => expect(mockSubmit).toHaveBeenCalled());
      resolveSubmit(makeAck());
      await p;
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    // 关键断言：流绝不能启动
    expect(getLastEventSource()).toBeUndefined();
    // loading 也要归零，不能卡在 sending 让 session 锁无法释放
    expect(result.current.loading).toBe(false);
  });

  // 同一 race 的 ensureRemoteSession 窗口版本：会话在 ensureRemoteSession 之后、submit 之前就被删
  it('does not submit or start stream if session deleted during ensureRemoteSession await', async () => {
    const params = baseParams();
    params.isSessionAlive = vi.fn().mockReturnValue(false); // 第一次就是已删

    const { result } = renderHook(() => useMessageSending(params));

    await act(async () => {
      await result.current.handleSend('x');
    });

    // 既不提交也不开流
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(getLastEventSource()).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });
});
