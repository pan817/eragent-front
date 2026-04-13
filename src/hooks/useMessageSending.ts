import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ApiChatSession } from '../types/api';
import { analyzeQuery } from '../services/api';
import type { SendOptions } from '../components/InputBar';

import { genId } from '../utils/id';

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
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set());
  const loading = loadingSessions.has(sessionId);

  const [busyTip, setBusyTip] = useState(false);
  const busyTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLoading = useCallback((sid: string) => {
    setLoadingSessions(prev => { const next = new Set(prev); next.add(sid); return next; });
  }, []);

  const stopLoading = useCallback((sid: string) => {
    setLoadingSessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
  }, []);

  const showBusyTip = useCallback(() => {
    setBusyTip(true);
    if (busyTipTimer.current !== null) clearTimeout(busyTipTimer.current);
    busyTipTimer.current = setTimeout(() => setBusyTip(false), 2000);
  }, []);

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
      const msg = err instanceof Error ? err.message : '会话创建失败，请重试';
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

    try {
      const res = await analyzeQuery({
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
      });

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
      const errorMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接';
      setMessages(prev =>
        prev.map(m => (m.id === clientAssistantId ? { ...m, content: errorMsg, status: 'error', timestamp: new Date() } : m)),
        sendSessionId
      );
    } finally {
      stopLoading(sendSessionId);
    }
  }, [loading, showBusyTip, userId, sessionId, startLoading, stopLoading, setMessages, ensureRemoteSession, commitSessionFromAnalyze, isGuestMode, onNeedLogin]);

  // ---- handleRegenerate ----
  const handleRegenerate = useCallback(
    (assistantMsgId: string) => {
      if (loading) { showBusyTip(); return; }

      const idx = messages.findIndex(m => m.id === assistantMsgId);
      if (idx <= 0) return;
      const userMsg = messages[idx - 1];
      if (userMsg.role !== 'user') return;

      let regenSessionId = sessionId;
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: '', status: 'sending' as const, durationMs: undefined, traceId: undefined }
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
          const msg = err instanceof Error ? err.message : '会话创建失败，请重试';
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

        try {
          const res = await analyzeQuery({
            query: userMsg.content,
            user_id: userId ?? '',
            session_id: realSessionId,
            auto_persist: !isGuestMode,
            regenerate_of: assistantMsgId,
            client_assistant_message_id: assistantMsgId,
          });
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
          const errorMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接';
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
    [loading, showBusyTip, sessionId, startLoading, stopLoading, messages, setMessages, userId, ensureRemoteSession, commitSessionFromAnalyze, isGuestMode]
  );

  return { loading, handleSend, handleRegenerate, showBusyTip, busyTip };
}
