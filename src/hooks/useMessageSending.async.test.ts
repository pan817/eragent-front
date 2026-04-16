import { renderHook, act } from '@testing-library/react';
import type { ChatMessage, AnalysisTaskAck, TaskSnapshot, ChunkEvent } from '../types/api';
import { resetToasts } from '../utils/toast';
import { installFakeEventSource, getLastEventSource, FakeEventSource } from '../test/fakeEventSource';

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

// ============================================================================
// Phase 2 ReAct 流式 chunk handler 测试（对应 sse_react_frontend.md §5.1 UT-F01~F06）
// ============================================================================
// 测试 onChunk 对不同 node / eos / index 回退 / 未知 node 的行为。
// 通过 fakeEventSource 推 chunk 事件 → 逐个把 setMessages 的 updater 串起来应用到初始状态，
// 还原出 reducer 连续作用后的最终 state，再断言气泡字段。
describe('useMessageSending (Phase 2 chunk handler)', () => {
  /**
   * 把 setMessages 的一串 updater 依次作用在初始 state 上，得到最终 state。
   * 过滤掉 sid 不匹配的调用（测试里固定 sess-1 + a-msg-1，其他 sid 的调用无关）。
   */
  function applyUpdaters(
    initial: ChatMessage[],
    calls: unknown[][],
    expectedSid: string
  ): ChatMessage[] {
    let state = initial;
    for (const call of calls) {
      const [arg, sid] = call as [unknown, string | undefined];
      if (sid !== expectedSid) continue;
      if (typeof arg === 'function') {
        state = (arg as (prev: ChatMessage[]) => ChatMessage[])(state);
      } else if (Array.isArray(arg)) {
        state = arg as ChatMessage[];
      }
    }
    return state;
  }

  /** 构造一个初始 assistant 气泡（ack 后的 sending 状态） */
  function makeAssistantBubble(id = 'a-msg-1'): ChatMessage {
    return {
      id,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'sending',
      traceId: 'tr-async-1',
    };
  }

  function makeChunk(overrides: Partial<ChunkEvent>): ChunkEvent {
    return {
      type: 'chunk',
      trace_id: 'tr-async-1',
      ts: '2026-04-16T10:00:00+08:00',
      seq: 0,
      node: 'agent_final',
      message_id: 'a-msg-1',
      delta: '',
      index: 0,
      eos: false,
      ...overrides,
    };
  }

  async function bootStream(): Promise<FakeEventSource> {
    mockSubmit.mockResolvedValue(makeAck());
    const params = baseParams();
    const { result } = renderHook(() => useMessageSending(params));
    await act(async () => {
      await result.current.handleSend('分析异常');
    });
    const es = getLastEventSource()!;
    es.open();
    // 把 params 挂到返回对象上，便于测试拿到 setMessages 的 mock
    (es as unknown as { __params: ReturnType<typeof baseParams> }).__params = params;
    return es;
  }

  // UT-F01：连续 agent_final chunk，index 0..N-1，末尾 eos=true → buffer 是全量 delta 拼接
  it('UT-F01: agent_final chunks accumulate and terminate on eos', async () => {
    const es = await bootStream();
    const params = (es as unknown as { __params: ReturnType<typeof baseParams> }).__params;

    await act(async () => {
      es.emit('chunk', makeChunk({ index: 0, delta: 'Hello ' }));
      es.emit('chunk', makeChunk({ index: 1, delta: 'ReAct ' }));
      es.emit('chunk', makeChunk({ index: 2, delta: 'world', eos: true }));
    });

    const finalState = applyUpdaters([makeAssistantBubble()], params.setMessages.mock.calls, 'sess-1');
    const bubble = finalState.find(m => m.id === 'a-msg-1')!;
    expect(bubble.chunkBuffer).toBe('Hello ReAct world');
    expect(bubble.chunkEosReceived).toBe(true);
    // eos 不清 streaming：避免 eos→done 空窗期 UI 闪回 LoadingStages；
    // 熄光标 + 切 MarkdownContent 统一由 onDone/applySnapshotToMessage 负责。
    expect(bubble.streaming).toBe(true);
  });

  // 关键纠偏点：eos=true 帧的 delta 可能非空（见 sse_react_backend_answers.md §2.5）
  // → 前端必须先 append 再停累加，不能把 eos 帧的 delta 丢弃。
  it('eos=true frame with non-empty delta is appended before stopping', async () => {
    const es = await bootStream();
    const params = (es as unknown as { __params: ReturnType<typeof baseParams> }).__params;

    await act(async () => {
      es.emit('chunk', makeChunk({ index: 0, delta: 'AAA' }));
      es.emit('chunk', makeChunk({ index: 1, delta: 'BBB-tail', eos: true }));
    });

    const finalState = applyUpdaters([makeAssistantBubble()], params.setMessages.mock.calls, 'sess-1');
    const bubble = finalState.find(m => m.id === 'a-msg-1')!;
    expect(bubble.chunkBuffer).toBe('AAABBB-tail');
    expect(bubble.chunkEosReceived).toBe(true);
  });

  // UT-F05：eos=true 之后再收到同 message_id chunk → 幂等忽略
  it('UT-F05: chunk after eos is ignored idempotently', async () => {
    const es = await bootStream();
    const params = (es as unknown as { __params: ReturnType<typeof baseParams> }).__params;

    await act(async () => {
      es.emit('chunk', makeChunk({ index: 0, delta: 'A', eos: true }));
      // 越权帧：eos 后还发同 id chunk
      es.emit('chunk', makeChunk({ index: 1, delta: 'SHOULD_IGNORE' }));
    });

    const finalState = applyUpdaters([makeAssistantBubble()], params.setMessages.mock.calls, 'sess-1');
    const bubble = finalState.find(m => m.id === 'a-msg-1')!;
    expect(bubble.chunkBuffer).toBe('A');
    expect(bubble.chunkEosReceived).toBe(true);
  });

  // UT-F06：未知 node → 告警并丢弃，不污染 buffer
  it('UT-F06: unknown chunk.node is warned and dropped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const es = await bootStream();
    const params = (es as unknown as { __params: ReturnType<typeof baseParams> }).__params;

    await act(async () => {
      es.emit('chunk', makeChunk({ index: 0, delta: 'good' }));
      es.emit('chunk', makeChunk({ index: 1, delta: 'evil', node: 'agent_reasoning' }));
      es.emit('chunk', makeChunk({ index: 1, delta: '-cont', eos: true }));
    });

    const finalState = applyUpdaters([makeAssistantBubble()], params.setMessages.mock.calls, 'sess-1');
    const bubble = finalState.find(m => m.id === 'a-msg-1')!;
    expect(bubble.chunkBuffer).toBe('good-cont');
    expect(warn).toHaveBeenCalledWith(
      '[sse] unknown chunk.node, ignored:',
      'agent_reasoning'
    );
    warn.mockRestore();
  });

  // UT-F03：同一 message_id 的 chunk 先 0,1,2,3 再回退到 0 → 清 buffer 重新累加
  it('UT-F03: index backtrack clears buffer (tenacity retry)', async () => {
    const es = await bootStream();
    const params = (es as unknown as { __params: ReturnType<typeof baseParams> }).__params;

    await act(async () => {
      es.emit('chunk', makeChunk({ index: 0, delta: 'first-' }));
      es.emit('chunk', makeChunk({ index: 1, delta: 'try-' }));
      es.emit('chunk', makeChunk({ index: 2, delta: 'failed' }));
      // 重试：后端重新从 index=0 推，delta 是新一轮真实增量（非空）
      es.emit('chunk', makeChunk({ index: 0, delta: 'retry-ok' }));
    });

    const finalState = applyUpdaters([makeAssistantBubble()], params.setMessages.mock.calls, 'sess-1');
    const bubble = finalState.find(m => m.id === 'a-msg-1')!;
    expect(bubble.chunkBuffer).toBe('retry-ok');
    expect(bubble.lastChunkIndex).toBe(0);
  });

  // UT-F04：混输 rollback 重置帧 {index:0, delta:"", eos:false} → buffer 清空，保持 typing
  it('UT-F04: rollback reset frame with empty delta clears buffer', async () => {
    const es = await bootStream();
    const params = (es as unknown as { __params: ReturnType<typeof baseParams> }).__params;

    await act(async () => {
      es.emit('chunk', makeChunk({ index: 0, delta: 'head' }));
      // 后端判定首 chunk 是 tool turn → 发空重置帧
      es.emit('chunk', makeChunk({ index: 0, delta: '' }));
      es.emit('chunk', makeChunk({ index: 1, delta: 'real-text' }));
    });

    const finalState = applyUpdaters([makeAssistantBubble()], params.setMessages.mock.calls, 'sess-1');
    const bubble = finalState.find(m => m.id === 'a-msg-1')!;
    expect(bubble.chunkBuffer).toBe('real-text');
  });
});
