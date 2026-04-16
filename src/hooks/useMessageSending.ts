import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  ChatMessage,
  ApiChatSession,
  AnalysisTimelineEntry,
  ChunkEvent,
  TaskSnapshot,
} from '../types/api';
import { ApiError } from '../types/api';
import { analyzeQuery, submitAnalyzeAsync, fetchTaskSnapshot } from '../services/api';
import { USE_ASYNC_ANALYZE } from '../services/constants';
import { useAnalysisStreams } from './useAnalysisStream';
import { errorMainText, tryErrorMainText } from '../utils/analysisErrorText';
import { recordDuration } from '../utils/analysisDurationHistory';
import type { AnalysisStreamHandlers } from '../services/analysisStream';
import { showToast } from '../utils/toast';
import type { SendOptions } from '../components/InputBar';

import { genId } from '../utils/id';

/**
 * 接受的 chunk.node 白名单。
 * - "report"：Phase 1 DAG 路径
 * - "agent_final"：Phase 2 ReAct 兜底路径（P2PAgent 最终 text turn）
 * 其他值视为协议外事件，告警并丢弃，避免未来后端新增 node 时污染当前气泡 buffer。
 */
const ACCEPTED_CHUNK_NODES: ReadonlySet<string> = new Set(['report', 'agent_final']);

/** 把错误上报给顶层 toast，便于用户在离开该消息气泡视野时也能感知失败 */
function reportSendError(err: unknown, fallbackMsg: string): string {
  const msg = err instanceof Error ? err.message : fallbackMsg;
  const level: 'warn' | 'error' =
    err instanceof ApiError && err.isNetworkError() ? 'warn' : 'error';
  showToast(msg, { level });
  return msg;
}

const DEFAULT_SEND_OPTIONS: SendOptions = {
  role: 'general',
  outputMode: 'auto',
  timeRange: '',
};

interface UseMessageSendingParams {
  userId: string | null;
  sessionId: string;
  messages: ChatMessage[];
  isGuestMode: boolean;
  setMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    targetSessionId?: string
  ) => void;
  ensureRemoteSession: () => Promise<string>;
  commitSessionFromAnalyze: (session: ApiChatSession) => void;
  /** 当用户未登录时，暂存 query 的回调 */
  onNeedLogin: (query: string) => void;
  /** 会话是否仍在列表里（未被删除）。handleSend/handleRegenerate 每个 await 后校验，防止
   *  用户删除 session 时在途的 send 继续给已删除会话注册流导致无法停止。 */
  isSessionAlive: (id: string) => boolean;
}

export interface UseMessageSendingReturn {
  loading: boolean;
  handleSend: (query: string, options?: SendOptions) => Promise<void>;
  handleRegenerate: (assistantMsgId: string) => void;
  showBusyTip: () => void;
  busyTip: boolean;
  /** 有正在跑任务的 sessionId 集合（含当前 session），供 Sidebar 显示 spinner */
  busySessions: Set<string>;
  /** 删除会话前调用，停止该 session 所有异步分析流（SSE + 降级轮询），避免 EventSource 空转 */
  stopSessionStreams: (sessionId: string) => void;
  /** 清空所有会话时调用，停止全部流 */
  stopAllStreams: () => void;
  /** 用户主动停止某条进行中的消息：停流 + 把消息标为 error。 */
  stopStreamForMessage: (assistantMsgId: string) => void;
}

export function useMessageSending({
  userId,
  sessionId,
  messages,
  isGuestMode,
  setMessages,
  ensureRemoteSession,
  commitSessionFromAnalyze,
  onNeedLogin,
  isSessionAlive,
}: UseMessageSendingParams): UseMessageSendingReturn {
  // handleRegenerate 需要读最新的 messages 找到目标消息前一条 user 消息；
  // 若直接把 messages 放进 useCallback deps，异步流 SSE 每次事件都会让 handleRegenerate 换引用，
  // 传给所有 MessageBubble 的 onRegenerate prop 跟着变，击穿 React.memo，导致整列重渲染。
  // 用 ref 作为"最新值"通道，deps 只放稳定值。
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 引用计数：一个 session 可以有多条并发进行中的任务（典型：刷新后同时恢复多条 pending 消息），
  // 任意一条 stop 都不应解锁 session loading —— 必须全部归零才算闲。
  const [loadingCounts, setLoadingCounts] = useState<ReadonlyMap<string, number>>(() => new Map());
  const loading = (loadingCounts.get(sessionId) ?? 0) > 0;
  const busySessions = useMemo(() => {
    const s = new Set<string>();
    loadingCounts.forEach((count, sid) => {
      if (count > 0) s.add(sid);
    });
    return s;
  }, [loadingCounts]);

  const [busyTip, setBusyTip] = useState(false);
  const busyTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * loadingCounts 的 ref 镜像，用于 handleSend/handleRegenerate 入口的"同步"忙碌判定。
   * 纯 state 版 `loading` 读的是闭包里上一次 render 的值，用户快速双击时两次点击都看到 false，
   * 导致提交两次。这里先动 ref 再 setState，保证同一个 tick 内的第二次点击立即被拒。
   */
  const loadingCountsRef = useRef<Map<string, number>>(new Map());
  const isSessionBusy = useCallback(
    (sid: string) => (loadingCountsRef.current.get(sid) ?? 0) > 0,
    []
  );

  const startLoading = useCallback((sid: string) => {
    loadingCountsRef.current.set(sid, (loadingCountsRef.current.get(sid) ?? 0) + 1);
    setLoadingCounts(new Map(loadingCountsRef.current));
  }, []);

  const stopLoading = useCallback((sid: string) => {
    const cur = loadingCountsRef.current.get(sid) ?? 0;
    if (cur <= 0) return;
    if (cur === 1) loadingCountsRef.current.delete(sid);
    else loadingCountsRef.current.set(sid, cur - 1);
    setLoadingCounts(new Map(loadingCountsRef.current));
  }, []);

  const showBusyTip = useCallback(() => {
    setBusyTip(true);
    if (busyTipTimer.current !== null) clearTimeout(busyTipTimer.current);
    busyTipTimer.current = setTimeout(() => setBusyTip(false), 2000);
  }, []);

  // 卸载时清理 busyTipTimer，避免定时器持有 setBusyTip 闭包阻止 GC
  useEffect(() => {
    return () => {
      if (busyTipTimer.current !== null) {
        clearTimeout(busyTipTimer.current);
        busyTipTimer.current = null;
      }
    };
  }, []);

  // ---- 异步流管理（仅 USE_ASYNC_ANALYZE=true 时会真正用到） ----
  const streams = useAnalysisStreams();

  // traceId → sessionId 映射。start 时记录、done/error 时删除；
  // deleteSession/clearAll 时根据此 map 定位并 stop 对应流，
  // 不依赖"非当前会话的 messages 未加载"这个边界。
  const streamToSessionRef = useRef(new Map<string, string>());

  const registerStream = useCallback((traceId: string, sid: string) => {
    streamToSessionRef.current.set(traceId, sid);
  }, []);

  const unregisterStream = useCallback((traceId: string) => {
    streamToSessionRef.current.delete(traceId);
  }, []);

  const stopSessionStreams = useCallback(
    (sid: string) => {
      const map = streamToSessionRef.current;
      for (const [traceId, s] of map) {
        if (s === sid) {
          streams.stop(traceId);
          map.delete(traceId);
        }
      }
    },
    [streams]
  );

  const stopAllStreams = useCallback(() => {
    streams.stopAll();
    streamToSessionRef.current.clear();
  }, [streams]);

  // 用户点"停止分析"：定位到消息对应的 traceId / sessionId，停流 + 把气泡标为 error。
  // 这里直接走 setMessages + unregister，不依赖流的 onError 回调，避免 cleanup 后回调
  // 已经不触发导致 UI 永远停在 sending。
  const stopStreamForMessage = useCallback((assistantMsgId: string) => {
    const msgs = messagesRef.current;
    const msg = msgs.find(m => m.id === assistantMsgId);
    if (!msg || !msg.traceId) return;
    const traceId = msg.traceId;
    const sid = streamToSessionRef.current.get(traceId) ?? sessionId;
    streams.stop(traceId);
    streamToSessionRef.current.delete(traceId);
    setMessages(
      prev =>
        prev.map(m => {
          if (m.id !== assistantMsgId) return m;
          // 已流出部分内容时保留它（用户主动停止 ≠ 失败，避免"已读的内容突然消失"）。
          // 没有任何内容时退回 error 分支，和原先一致。
          const hasPartial = !!(m.streaming && m.chunkBuffer && m.chunkBuffer.length > 0);
          if (hasPartial) {
            return {
              ...m,
              content: m.chunkBuffer!,
              status: 'success' as const,
              aborted: true,
              stageText: undefined,
              timeline: undefined,
              degradedToPolling: undefined,
              resumedAt: undefined,
              streaming: undefined,
              chunkBuffer: undefined,
              lastChunkIndex: undefined,
              chunkBroken: undefined,
              chunkEosReceived: undefined,
            };
          }
          return {
            ...m,
            content: '已手动停止分析',
            status: 'error' as const,
            stageText: undefined,
            timeline: undefined,
            degradedToPolling: undefined,
            resumedAt: undefined,
            streaming: undefined,
            chunkBuffer: undefined,
            lastChunkIndex: undefined,
            chunkBroken: undefined,
            chunkEosReceived: undefined,
          };
        }),
      sid
    );
    stopLoading(sid);
  }, [streams, setMessages, stopLoading, sessionId]);

  // 给 onDone/onError toast 加 session 上下文：如果任务完成时用户已切到别的 session，
  // toast 要告诉他"其他会话"，避免他在当前 session 看到莫名其妙的失败提示。
  // 用 ref 读最新 sessionId 避免 handler 闭包捕获陈旧值。
  const currentSessionIdRef = useRef(sessionId);
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  const notifyForSession = useCallback(
    (
      msgSessionId: string,
      text: string,
      level: 'warn' | 'error' | 'info' = 'info',
      opts: { skipWhenInView?: boolean } = {}
    ) => {
      const inView = currentSessionIdRef.current === msgSessionId;
      // 成功态：用户在当前会话能直接看到气泡变报告，toast 是噪声 → 跳过；
      // 用户在其他会话时才弹，告诉他"那边好了"。
      if (inView && opts.skipWhenInView) return;
      const finalText = inView ? text : `其他会话：${text}`;
      showToast(finalText, { level });
    },
    []
  );

  /** 把 done 快照应用到对应的 assistant 气泡上（成功/失败分支） */
  const applySnapshotToMessage = useCallback(
    (assistantMsgId: string, sid: string, snap: TaskSnapshot) => {
      if (snap.status === 'ok' && snap.result) {
        const result = snap.result;
        const content = result.report_markdown || '分析完成，但未生成报告内容。';
        const finalDuration = snap.duration_ms ?? result.duration_ms;
        setMessages(
          prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content,
                    status: 'success' as const,
                    durationMs: finalDuration,
                    traceId: snap.trace_id,
                    stageText: undefined,
                    timeline: undefined,
                    degradedToPolling: undefined,
                    resumedAt: undefined,
                    errorCode: undefined,
                    streaming: undefined,
                    chunkBuffer: undefined,
                    lastChunkIndex: undefined,
                    chunkBroken: undefined,
                    chunkEosReceived: undefined,
                  }
                : m
            ),
          sid
        );
        recordDuration(finalDuration);
        notifyForSession(sid, '分析完成', 'info', { skipWhenInView: true });
        if (result.session) commitSessionFromAnalyze(result.session);
      } else {
        const main = errorMainText(snap.error?.code);
        const detail = snap.error?.message;
        const content = detail ? `${main}\n（详情：${detail}）` : main;
        setMessages(
          prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content,
                    status: 'error' as const,
                    traceId: snap.trace_id,
                    stageText: undefined,
                    timeline: undefined,
                    degradedToPolling: undefined,
                    resumedAt: undefined,
                    errorCode: snap.error?.code,
                    streaming: undefined,
                    chunkBuffer: undefined,
                    lastChunkIndex: undefined,
                    chunkBroken: undefined,
                    chunkEosReceived: undefined,
                  }
                : m
            ),
          sid
        );
        notifyForSession(sid, main, 'error');
      }
    },
    [setMessages, commitSessionFromAnalyze, notifyForSession]
  );

  /** 构造 stream handlers：阶段/时间线/终态/错误都映射到对应气泡的 setMessages */
  const buildStreamHandlers = useCallback(
    (assistantMsgId: string, sid: string): AnalysisStreamHandlers => ({
      onStage: text => {
        setMessages(
          prev =>
            prev.map(m => (m.id === assistantMsgId ? { ...m, stageText: text } : m)),
          sid
        );
      },
      onTimelineAppend: (entry: AnalysisTimelineEntry) => {
        setMessages(
          prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, timeline: [...(m.timeline ?? []), entry] }
                : m
            ),
          sid
        );
      },
      onTimelineUpdate: (matchKey, patch) => {
        setMessages(
          prev =>
            prev.map(m => {
              if (m.id !== assistantMsgId) return m;
              const list = m.timeline ?? [];
              // 从尾向头找最近一条同 key 且"进行中"（无 durationMs）的条目；
              // 找到就就地改写；找不到说明 end 来前 start 丢了，append 一条完成态容错。
              let updated = false;
              const next: AnalysisTimelineEntry[] = [];
              for (let i = list.length - 1; i >= 0; i--) {
                const entry = list[i];
                if (!updated && entry.matchKey === matchKey && entry.durationMs === undefined) {
                  next.unshift({ ...entry, text: patch.text, durationMs: patch.durationMs });
                  updated = true;
                } else {
                  next.unshift(entry);
                }
              }
              if (!updated) {
                next.push({
                  ts: new Date().toISOString(),
                  text: patch.text,
                  durationMs: patch.durationMs,
                  matchKey,
                });
              }
              return { ...m, timeline: next };
            }),
          sid
        );
      },
      onChunk: (chunk: ChunkEvent) => {
        // 规则 0：未知 node 视为协议外事件，告警并丢弃（UT-F06）。
        // 当前只接受 "report"(Phase 1 DAG) 和 "agent_final"(Phase 2 ReAct) 两种。
        if (!ACCEPTED_CHUNK_NODES.has(chunk.node)) {
          console.warn('[sse] unknown chunk.node, ignored:', chunk.node);
          return;
        }
        // 规则 1：message_id 不匹配直接丢弃（多任务并发或其他气泡的 chunk）
        if (chunk.message_id !== assistantMsgId) return;
        setMessages(
          prev =>
            prev.map(m => {
              if (m.id !== assistantMsgId) return m;
              // 规则 2：eos 后再收到同 message_id chunk → 幂等丢弃并告警（UT-F05）。
              // 后端契约保证 eos 后不再发同 id chunk；前端仍需防御性忽略。
              if (m.chunkEosReceived) {
                console.warn(
                  '[sse] chunk after eos, ignored:',
                  { index: chunk.index, node: chunk.node }
                );
                return m;
              }
              const last = m.lastChunkIndex ?? -1;
              // 规则 3：index 回退 → 清 buffer 重新累加。覆盖两种后端路径：
              //   a) tenacity 重试：新一轮首 chunk index=0，delta 可能非空（真实增量）
              //   b) 混输 rollback：后端主动发 {index:0, delta:"", eos:false} 重置帧
              // 两种路径处理完全相同，前端不区分。
              const isRetryReset = chunk.index <= last && last >= 0;
              const buffer = isRetryReset ? '' : (m.chunkBuffer ?? '');
              // 规则 4：gap（非重置情况下 index 非连续）→ 标记 chunkBroken，仍 append；
              // done 时会用 report_markdown 覆盖保证一致性。
              const isGap = !isRetryReset && last >= 0 && chunk.index > last + 1;
              // 规则 5：eos=true 帧的 delta 可能非空（后端 _flush(eos=True) 可能带尾部残留）→
              // 必须先 append 再停止累加。
              // 注意：eos 不清 streaming、不切 UI 渲染分支——因为 MessageBubble 的分支是
              //   "sending + streaming → StreamingText" / "sending + !streaming → LoadingStages"
              // 而 eos 到 done 之间有 100~800ms 空窗（content 还没被快照填），若此时清 streaming
              // 会闪回 LoadingStages（执行过程时间线）。统一由 onDone→applySnapshotToMessage
              // 作为唯一熄光标 + 切 MarkdownContent 的触发点；error/aborted 场景后端也不保证
              // 发 eos，以 done 为最终停止信号，语义一致。
              const eos = chunk.eos === true;
              return {
                ...m,
                streaming: true,
                chunkBuffer: buffer + (chunk.delta ?? ''),
                lastChunkIndex: chunk.index,
                chunkBroken: isGap ? true : (isRetryReset ? false : m.chunkBroken),
                chunkEosReceived: eos ? true : m.chunkEosReceived,
                // chunk 期间隐藏 stageText（避免打字机上方仍显示"正在生成报告..."）
                stageText: undefined,
              };
            }),
          sid
        );
      },
      onDegraded: () => {
        setMessages(
          prev =>
            prev.map(m =>
              m.id === assistantMsgId ? { ...m, degradedToPolling: true } : m
            ),
          sid
        );
      },
      onDone: snap => {
        unregisterStream(snap.trace_id);
        applySnapshotToMessage(assistantMsgId, sid, snap);
        stopLoading(sid);
      },
      onError: err => {
        // P1-6: 异步流错误先走 errorMainText 映射（TIMEOUT/API_ERROR/...），
        // 没命中再回退到原始 err.message。气泡主文案用映射值，toast 一致。
        const mapped = err instanceof ApiError ? tryErrorMainText(err.code) : undefined;
        const fallback = err instanceof Error ? err.message : '分析流中断，请重新发起';
        const shown = mapped ?? fallback;
        const level: 'warn' | 'error' =
          err instanceof ApiError && err.isNetworkError() ? 'warn' : 'error';
        notifyForSession(sid, shown, level);
        setMessages(
          prev =>
            prev.map(m => {
              if (m.id !== assistantMsgId) return m;
              // onError 没有 traceId 参数，只能从消息里取
              if (m.traceId) unregisterStream(m.traceId);
              return {
                ...m,
                content: shown,
                status: 'error' as const,
                stageText: undefined,
                timeline: undefined,
                degradedToPolling: undefined,
                resumedAt: undefined,
                errorCode: err instanceof ApiError ? err.code : undefined,
                streaming: undefined,
                chunkBuffer: undefined,
                lastChunkIndex: undefined,
                chunkBroken: undefined,
                chunkEosReceived: undefined,
              };
            }),
          sid
        );
        stopLoading(sid);
      },
    }),
    [setMessages, applySnapshotToMessage, stopLoading, notifyForSession, unregisterStream]
  );

  /**
   * 记录哪些 traceId 已经被 resume 过一次。effect 的 dep 里有 `messages`，流事件每到一次都会
   * 导致 messages 重新引用，effect 重跑。没有这个 ref 的话，同一条 pending 消息会反复
   * `setMessages({...msg, resumedAt: Date.now()})`，造成 O(N²) 渲染且 resumedAt 每次都是新值
   * （虽然 isActive 兜底阻止了重复 start，但状态级联仍在）。
   */
  const resumedTracesRef = useRef<Set<string>>(new Set());

  // ---- 刷新/切会话后恢复订阅：对 status='sending' 且有 traceId 的消息重连 ----
  //
  // 后端 chat_messages.status 在任务真正终结后应固化为 success/error，但实际存在滞留
  // pending 的情况（worker 崩溃、终态 publish 漏写、落库滞后等，见
  // docs/async_analyze_backend_issue.md Issue 3）。不加保护的话，每次刷新都会把已终结任务
  // 当成"还在跑"重订阅一次 SSE，形成循环。
  //
  // 这里在 streams.start 之前强制查一次 snapshot：任务已经终态就直接把气泡落到终态，
  // 不再开 SSE；仍在 running/queued 才真的订阅。fetchTaskSnapshot 失败时走原路径开
  // SSE（交给流自身的 watchdog / 熔断兜底），避免一次网络抖动让用户的在途任务永久失联。
  useEffect(() => {
    if (!USE_ASYNC_ANALYZE) return;
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      if (m.status !== 'sending') continue;
      if (!m.traceId) continue;
      if (resumedTracesRef.current.has(m.traceId)) continue;
      if (streams.isActive(m.traceId)) continue;
      resumedTracesRef.current.add(m.traceId);
      const traceId = m.traceId;
      const msgId = m.id;
      const sid = sessionId;
      startLoading(sid);
      (async () => {
        let snap: TaskSnapshot | null = null;
        try {
          snap = await fetchTaskSnapshot(traceId);
        } catch {
          // 快照取不到：走原路径开 SSE，不在这里做重试
        }
        if (
          snap &&
          (snap.status === 'ok' || snap.status === 'error' || snap.status === 'aborted')
        ) {
          applySnapshotToMessage(msgId, sid, snap);
          stopLoading(sid);
          return;
        }
        // 非终态：真开 SSE，打 resumedAt 横幅让用户看到"已恢复未完成的分析"
        const resumedAt = Date.now();
        setMessages(
          prev => prev.map(msg => (msg.id === msgId ? { ...msg, resumedAt } : msg)),
          sid
        );
        registerStream(traceId, sid);
        streams.start(traceId, buildStreamHandlers(msgId, sid));
      })();
    }
  }, [
    messages,
    sessionId,
    streams,
    buildStreamHandlers,
    startLoading,
    stopLoading,
    setMessages,
    registerStream,
    applySnapshotToMessage,
  ]);

  // ---- handleSend ----
  const handleSend = useCallback(async (query: string, options: SendOptions = DEFAULT_SEND_OPTIONS) => {
    // 同步读 ref，挡住双击/连点提交（state 版 `loading` 有一帧延迟）
    if (isSessionBusy(sessionId)) { showBusyTip(); return; }

    if (!userId) {
      onNeedLogin(query);
      return;
    }

    let sendSessionId = sessionId;
    const clientUserId = genId();
    const clientAssistantId = genId();

    const userMsg: ChatMessage = {
      id: clientUserId,
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    const assistantPlaceholder: ChatMessage = {
      id: clientAssistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages(prev => [...prev, userMsg, assistantPlaceholder], sendSessionId);
    startLoading(sendSessionId);

    // 1. 确保后端 session 存在（temp → real）
    let realSessionId: string;
    try {
      realSessionId = await ensureRemoteSession();
    } catch (err) {
      console.error('[handleSend] ensureRemoteSession failed:', err);
      const msg = reportSendError(err, '会话创建失败，请重试');
      setMessages(prev =>
        prev.map(m =>
          m.id === clientAssistantId
            ? { ...m, content: `会话创建失败：${msg}`, status: 'error' as const }
            : m
        ),
        sendSessionId
      );
      stopLoading(sendSessionId);
      return;
    }

    // temp→real 替换后，loading 锁跟上新 ID
    if (realSessionId !== sendSessionId) {
      stopLoading(sendSessionId);
      startLoading(realSessionId);
      sendSessionId = realSessionId;
    }

    // await 期间 session 可能已被删除：继续注册流会导致流无法停止（send-then-delete race）
    if (!isSessionAlive(sendSessionId)) {
      stopLoading(sendSessionId);
      return;
    }

    // 2. 构造请求
    const fullQuery = query;
    const effectiveSessionId = realSessionId;
    const shouldPersist = !isGuestMode;

    const requestBody = {
      query: fullQuery,
      user_id: userId,
      session_id: effectiveSessionId,
      analyst_role: options.role,
      output_mode: options.outputMode,
      time_range: options.timeRange || undefined,
      auto_persist: shouldPersist,
      client_user_message_id: clientUserId,
      client_assistant_message_id: clientAssistantId,
      metadata: {},
    };

    if (USE_ASYNC_ANALYZE) {
      try {
        const ack = await submitAnalyzeAsync(requestBody);
        // ack 回来时 session 可能已被删除：绝不能再注册流；若依然活着走正常流程
        if (!isSessionAlive(sendSessionId)) {
          stopLoading(sendSessionId);
          return;
        }
        const realUserId = ack.user_message_id ?? clientUserId;
        const realAssistantId = ack.assistant_message_id ?? clientAssistantId;
        setMessages(
          prev =>
            prev.map(m => {
              if (m.id === clientUserId) return { ...m, id: realUserId };
              if (m.id === clientAssistantId) {
                return { ...m, id: realAssistantId, traceId: ack.trace_id };
              }
              return m;
            }),
          sendSessionId
        );
        // 流的 onDone / onError 负责最终状态 + stopLoading
        registerStream(ack.trace_id, sendSessionId);
        streams.start(ack.trace_id, buildStreamHandlers(realAssistantId, sendSessionId));
      } catch (err) {
        const errorMsg = reportSendError(err, '请求失败，请检查网络连接');
        setMessages(
          prev =>
            prev.map(m =>
              m.id === clientAssistantId
                ? { ...m, content: errorMsg, status: 'error' as const, timestamp: new Date() }
                : m
            ),
          sendSessionId
        );
        stopLoading(sendSessionId);
      }
      return;
    }

    try {
      const res = await analyzeQuery(requestBody);

      const content =
        res.status === 'success'
          ? res.report_markdown || '分析完成，但未生成报告内容。'
          : `分析失败: ${res.error || '未知错误'}`;

      const realUserId = res.user_message_id ?? clientUserId;
      const realAssistantId = res.assistant_message_id ?? clientAssistantId;

      setMessages(prev =>
        prev.map(m => {
          if (m.id === clientUserId) return { ...m, id: realUserId };
          if (m.id === clientAssistantId) {
            return {
              ...m,
              id: realAssistantId,
              content,
              status: res.status === 'success' ? 'success' : 'error',
              durationMs: res.duration_ms,
              traceId: res.trace_id,
            };
          }
          return m;
        }),
        sendSessionId
      );

      if (res.session) {
        commitSessionFromAnalyze(res.session);
      }
    } catch (err) {
      const errorMsg = reportSendError(err, '请求失败，请检查网络连接');
      setMessages(prev =>
        prev.map(m => (m.id === clientAssistantId ? { ...m, content: errorMsg, status: 'error', timestamp: new Date() } : m)),
        sendSessionId
      );
    } finally {
      stopLoading(sendSessionId);
    }
  }, [isSessionBusy, showBusyTip, userId, sessionId, startLoading, stopLoading, setMessages, ensureRemoteSession, commitSessionFromAnalyze, isGuestMode, onNeedLogin, streams, buildStreamHandlers, registerStream, isSessionAlive]);

  // ---- handleRegenerate ----
  const handleRegenerate = useCallback(
    (assistantMsgId: string) => {
      if (isSessionBusy(sessionId)) { showBusyTip(); return; }

      const msgs = messagesRef.current;
      const idx = msgs.findIndex(m => m.id === assistantMsgId);
      if (idx <= 0) return;
      const userMsg = msgs[idx - 1];
      if (userMsg.role !== 'user') return;

      let regenSessionId = sessionId;
      // 注意：异步模式下 traceId 先保留旧值，等 ack 拿到新 traceId 后一次性替换。
      // 否则"重试刚提交、新 traceId 还没回来"这段窗口刷新页面 → 没 traceId 无法恢复订阅。
      // 同步模式下 traceId 用不到，保留也无害。
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: '',
                status: 'sending' as const,
                durationMs: undefined,
                streaming: undefined,
                chunkBuffer: undefined,
                lastChunkIndex: undefined,
                chunkBroken: undefined,
                chunkEosReceived: undefined,
                stageText: undefined,
                timeline: undefined,
              }
            : m
        ),
        regenSessionId
      );
      startLoading(regenSessionId);

      (async () => {
        let realSessionId: string;
        try {
          realSessionId = await ensureRemoteSession();
        } catch (err) {
          const msg = reportSendError(err, '会话创建失败，请重试');
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: `会话创建失败：${msg}`, status: 'error' as const }
                : m
            ),
            regenSessionId
          );
          stopLoading(regenSessionId);
          return;
        }

        if (realSessionId !== regenSessionId) {
          stopLoading(regenSessionId);
          startLoading(realSessionId);
          regenSessionId = realSessionId;
        }

        // await 期间 session 可能已被删除，参见 handleSend 同名检查
        if (!isSessionAlive(regenSessionId)) {
          stopLoading(regenSessionId);
          return;
        }

        const requestBody = {
          query: userMsg.content,
          user_id: userId ?? '',
          session_id: realSessionId,
          auto_persist: !isGuestMode,
          regenerate_of: assistantMsgId,
          client_assistant_message_id: assistantMsgId,
        };

        if (USE_ASYNC_ANALYZE) {
          try {
            const ack = await submitAnalyzeAsync(requestBody);
            if (!isSessionAlive(regenSessionId)) {
              stopLoading(regenSessionId);
              return;
            }
            const realAssistantId = ack.assistant_message_id ?? assistantMsgId;
            setMessages(
              prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, id: realAssistantId, traceId: ack.trace_id }
                    : m
                ),
              regenSessionId
            );
            registerStream(ack.trace_id, regenSessionId);
            streams.start(
              ack.trace_id,
              buildStreamHandlers(realAssistantId, regenSessionId)
            );
          } catch (err) {
            const errorMsg = reportSendError(err, '请求失败，请检查网络连接');
            setMessages(
              prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: errorMsg, status: 'error' as const, timestamp: new Date() }
                    : m
                ),
              regenSessionId
            );
            stopLoading(regenSessionId);
          }
          return;
        }

        try {
          const res = await analyzeQuery(requestBody);
          const content =
            res.status === 'success'
              ? res.report_markdown || '分析完成，但未生成报告内容。'
              : `分析失败: ${res.error || '未知错误'}`;
          const realAssistantId = res.assistant_message_id ?? assistantMsgId;
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    id: realAssistantId,
                    content,
                    status: res.status === 'success' ? 'success' : 'error',
                    durationMs: res.duration_ms,
                    traceId: res.trace_id,
                  }
                : m
            ),
            regenSessionId
          );
          if (res.session) {
            commitSessionFromAnalyze(res.session);
          }
        } catch (err) {
          const errorMsg = reportSendError(err, '请求失败，请检查网络连接');
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: errorMsg, status: 'error' as const, timestamp: new Date() }
                : m
            ),
            regenSessionId
          );
        } finally {
          stopLoading(regenSessionId);
        }
      })();
    },
    // messages 通过 messagesRef 读，不进 deps —— 避免 SSE 事件打穿 MessageBubble 的 memo
    [isSessionBusy, showBusyTip, sessionId, startLoading, stopLoading, setMessages, userId, ensureRemoteSession, commitSessionFromAnalyze, isGuestMode, streams, buildStreamHandlers, registerStream, isSessionAlive]
  );

  return {
    loading,
    handleSend,
    handleRegenerate,
    showBusyTip,
    busyTip,
    busySessions,
    stopSessionStreams,
    stopAllStreams,
    stopStreamForMessage,
  };
}
