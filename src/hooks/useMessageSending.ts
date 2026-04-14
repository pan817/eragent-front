import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  ChatMessage,
  ApiChatSession,
  AnalysisTimelineEntry,
  TaskSnapshot,
} from '../types/api';
import { ApiError } from '../types/api';
import { analyzeQuery, submitAnalyzeAsync } from '../services/api';
import { USE_ASYNC_ANALYZE } from '../services/constants';
import { useAnalysisStreams } from './useAnalysisStream';
import { errorMainText, tryErrorMainText } from '../utils/analysisErrorText';
import { recordDuration } from '../utils/analysisDurationHistory';
import type { AnalysisStreamHandlers } from '../services/analysisStream';
import { showToast } from '../utils/toast';
import type { SendOptions } from '../components/InputBar';

import { genId } from '../utils/id';

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
  outputMode: 'detailed',
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
}

export interface UseMessageSendingReturn {
  loading: boolean;
  handleSend: (query: string, options?: SendOptions) => Promise<void>;
  handleRegenerate: (assistantMsgId: string) => void;
  showBusyTip: () => void;
  busyTip: boolean;
  /** 有正在跑任务的 sessionId 集合（含当前 session），供 Sidebar 显示 spinner */
  busySessions: Set<string>;
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
  const [loadingCounts, setLoadingCounts] = useState<ReadonlyMap<string, number>>(new Map());
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

  const startLoading = useCallback((sid: string) => {
    setLoadingCounts(prev => {
      const next = new Map(prev);
      next.set(sid, (next.get(sid) ?? 0) + 1);
      return next;
    });
  }, []);

  const stopLoading = useCallback((sid: string) => {
    setLoadingCounts(prev => {
      const cur = prev.get(sid) ?? 0;
      if (cur <= 1) {
        if (cur === 0) return prev;
        const next = new Map(prev);
        next.delete(sid);
        return next;
      }
      const next = new Map(prev);
      next.set(sid, cur - 1);
      return next;
    });
  }, []);

  const showBusyTip = useCallback(() => {
    setBusyTip(true);
    if (busyTipTimer.current !== null) clearTimeout(busyTipTimer.current);
    busyTipTimer.current = setTimeout(() => setBusyTip(false), 2000);
  }, []);

  // ---- 异步流管理（仅 USE_ASYNC_ANALYZE=true 时会真正用到） ----
  const streams = useAnalysisStreams();

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
            prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: shown,
                    status: 'error' as const,
                    stageText: undefined,
                    timeline: undefined,
                    degradedToPolling: undefined,
                    resumedAt: undefined,
                    errorCode: err instanceof ApiError ? err.code : undefined,
                  }
                : m
            ),
          sid
        );
        stopLoading(sid);
      },
    }),
    [setMessages, applySnapshotToMessage, stopLoading]
  );

  // ---- 刷新/切会话后恢复订阅：对 status='sending' 且有 traceId 的消息重连 ----
  useEffect(() => {
    if (!USE_ASYNC_ANALYZE) return;
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      if (m.status !== 'sending') continue;
      if (!m.traceId) continue;
      if (streams.isActive(m.traceId)) continue;
      startLoading(sessionId);
      // 打 resumedAt 标记让气泡展示"已恢复未完成的分析"横幅（自动淡出）
      const resumedAt = Date.now();
      setMessages(
        prev =>
          prev.map(msg => (msg.id === m.id ? { ...msg, resumedAt } : msg)),
        sessionId
      );
      streams.start(m.traceId, buildStreamHandlers(m.id, sessionId));
    }
  }, [messages, sessionId, streams, buildStreamHandlers, startLoading, setMessages]);

  // ---- handleSend ----
  const handleSend = useCallback(async (query: string, options: SendOptions = DEFAULT_SEND_OPTIONS) => {
    if (loading) { showBusyTip(); return; }

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
  }, [loading, showBusyTip, userId, sessionId, startLoading, stopLoading, setMessages, ensureRemoteSession, commitSessionFromAnalyze, isGuestMode, onNeedLogin, streams, buildStreamHandlers]);

  // ---- handleRegenerate ----
  const handleRegenerate = useCallback(
    (assistantMsgId: string) => {
      if (loading) { showBusyTip(); return; }

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
            ? { ...m, content: '', status: 'sending' as const, durationMs: undefined }
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
    [loading, showBusyTip, sessionId, startLoading, stopLoading, setMessages, userId, ensureRemoteSession, commitSessionFromAnalyze, isGuestMode, streams, buildStreamHandlers]
  );

  return { loading, handleSend, handleRegenerate, showBusyTip, busyTip, busySessions };
}
