import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ChatMessage } from '../types/api';
import { analyzeQuery } from '../services/api';
import { useChatSessions } from '../hooks/useChatSessions';
import MessageBubble from './MessageBubble';
import InputBar, { type SendOptions, type AnalystRole } from './InputBar';
import TraceModal from './TraceModal';
import Login from './Login';
import Sidebar from './Sidebar';
import FeedbackButton from './FeedbackButton';
import ExamplePromptsDrawer from './ExamplePromptsDrawer';
import TestDataTipsModal from './TestDataTipsModal';
import type { ExamplePrompt } from '../data/examplePrompts';

const ROLE_PROMPT_PREFIX: Record<AnalystRole, string> = {
  general: '',
  procurement:
    '请以【采购分析师】视角回答，重点关注供应商、采购订单、价格偏差与交付情况。问题：',
  finance:
    '请以【财务分析师】视角回答，重点关注金额、成本、应付与三路匹配合规性。问题：',
  supply:
    '请以【供应链主管】视角回答，重点关注交付及时率、库存风险与异常处置。问题：',
};

const EXT_DATA_HINT = '（请在分析中结合外部市场价格等参考数据）';

const genId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const DEFAULT_SEND_OPTIONS: SendOptions = {
  role: 'general',
  useMemory: true,
  useExtData: false,
};

interface ChatWindowProps {
  userId: string | null;
  onLogin: (username: string) => void;
  onLogout: () => void;
}

interface Suggestion {
  icon: string;
  title: string;
  description: string;
  query: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: '🔍',
    title: '三路匹配异常',
    description: '检测 PO、收货、发票之间的数量与金额偏差',
    query: '分析最近的三路匹配异常情况，看看哪些订单存在数量或金额偏差',
  },
  {
    icon: '💰',
    title: '价格差异分析',
    description: '对比实际采购价格与合同价，找出偏差较大的订单',
    query: '分析所有供应商的采购价格差异，找出实际价格与合同价偏差较大的订单',
  },
  {
    icon: '📦',
    title: '采购订单异常',
    description: '查看近期采购订单中的高风险异常',
    query: '查看最近30天的采购订单异常，按严重等级排序',
  },
  {
    icon: '📊',
    title: '供应商绩效',
    description: '评估供应商 KPI 指标，识别表现不佳的供应商',
    query: '评估所有供应商最近30天的绩效 KPI，找出表现不佳的供应商',
  },
];

export default function ChatWindow({ userId, onLogin, onLogout }: ChatWindowProps) {
  const {
    sessions,
    currentId,
    messages,
    setMessages,
    newChat,
    switchTo,
    deleteSession,
    clearAll,
    search,
    setSearch,
    filteredSessions,
    ensureRemoteSession,
    commitSessionFromAnalyze,
    isGuestMode,
  } = useChatSessions(userId);
  const sessionId = currentId;
  const [loading, setLoading] = useState(false);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [draft, setDraft] = useState<{ text: string; nonce: number }>({ text: '', nonce: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // 智能滚动：只有用户已在底部时才自动滚动
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100;
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const handleSend = useCallback(async (query: string, options: SendOptions = DEFAULT_SEND_OPTIONS) => {
    if (!userId) {
      setPendingQuery(query);
      setShowLogin(true);
      return;
    }

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

    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    setLoading(true);
    shouldAutoScroll.current = true;

    // 1. 确保后端 session 存在（temp → 调 POST /sessions 拿真 id）
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
        )
      );
      setLoading(false);
      return;
    }

    // 2. 拼 prompt
    const prefix = ROLE_PROMPT_PREFIX[options.role] || '';
    const suffix = options.useExtData ? EXT_DATA_HINT : '';
    const fullQuery = `${prefix}${query}${suffix}`;
    // memory-off → 用临时 sessionId 隔离后端 context；不落库
    const effectiveSessionId = options.useMemory ? realSessionId : `oneshot-${genId()}`;
    const shouldPersist = options.useMemory && !isGuestMode;

    try {
      const res = await analyzeQuery({
        query: fullQuery,
        user_id: userId,
        session_id: effectiveSessionId,
        auto_persist: shouldPersist,
        client_user_message_id: clientUserId,
        client_assistant_message_id: clientAssistantId,
        metadata: {
          analyst_role: options.role,
          use_memory: options.useMemory,
          use_ext_data: options.useExtData,
        },
      });

      const content =
        res.status === 'success'
          ? res.report_markdown || '分析完成，但未生成报告内容。'
          : `分析失败: ${res.error || '未知错误'}`;

      // 乐观消息对账：拿到真实 ID 就替换
      const realUserId = res.user_message_id ?? clientUserId;
      const realAssistantId = res.assistant_message_id ?? clientAssistantId;

      setMessages(prev =>
        prev.map(m => {
          if (m.id === clientUserId) {
            return { ...m, id: realUserId };
          }
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
        })
      );

      // 用后端返回的 session 元信息刷新本地 session（title / count / updated_at 等）
      if (res.session) {
        commitSessionFromAnalyze(res.session);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接';
      setMessages(prev =>
        prev.map(m => (m.id === clientAssistantId ? { ...m, content: errorMsg, status: 'error' } : m))
      );
    } finally {
      setLoading(false);
    }
  }, [userId, setMessages, ensureRemoteSession, commitSessionFromAnalyze, isGuestMode]);

  const handleRegenerate = useCallback(
    (assistantMsgId: string) => {
      const idx = messages.findIndex(m => m.id === assistantMsgId);
      if (idx <= 0) return;
      const userMsg = messages[idx - 1];
      if (userMsg.role !== 'user') return;
      // 乐观：把 assistant 消息重置为 sending 占位，保留 user 消息
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: '', status: 'sending' as const, durationMs: undefined, traceId: undefined }
            : m
        )
      );
      shouldAutoScroll.current = true;
      setLoading(true);

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
            )
          );
          setLoading(false);
          return;
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
            )
          );
          if (res.session) {
            commitSessionFromAnalyze(res.session);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接';
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: errorMsg, status: 'error' as const }
                : m
            )
          );
        } finally {
          setLoading(false);
        }
      })();
    },
    [messages, setMessages, userId, ensureRemoteSession, commitSessionFromAnalyze, isGuestMode]
  );

  const lastDurationMs = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.status === 'success' && m.durationMs !== undefined) {
        return m.durationMs;
      }
    }
    return undefined;
  }, [messages]);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeTraceId) {
        setActiveTraceId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTraceId]);

  // 登录后自动继续发送此前暂存的消息
  useEffect(() => {
    if (userId && pendingQuery) {
      const q = pendingQuery;
      setPendingQuery(null);
      handleSend(q, DEFAULT_SEND_OPTIONS);
    }
  }, [userId, pendingQuery, handleSend]);

  const handleNewChat = useCallback(() => {
    newChat();
    setActiveTraceId(null);
    shouldAutoScroll.current = true;
  }, [newChat]);

  const handleSwitchSession = useCallback(
    (id: string) => {
      if (id === currentId) return;
      switchTo(id);
      setActiveTraceId(null);
      shouldAutoScroll.current = true;
    },
    [currentId, switchTo]
  );

  const handlePickExample = useCallback(
    (p: ExamplePrompt) => {
      if (p.editable) {
        // 含参数（ID）类问题：填入输入框，等用户修改后再发送
        setDraft(d => ({ text: p.query, nonce: d.nonce + 1 }));
      } else {
        // 直接发送
        handleSend(p.query, DEFAULT_SEND_OPTIONS);
      }
    },
    [handleSend]
  );

  return (
    <div className="app-shell">
      <Sidebar
        userId={userId}
        messages={messages}
        sessions={sessions}
        currentId={currentId}
        filteredSessions={filteredSessions}
        search={search}
        onSearchChange={setSearch}
        onSwitchSession={handleSwitchSession}
        onDeleteSession={deleteSession}
        onClearAll={clearAll}
        onLoginClick={() => setShowLogin(true)}
        onLogout={onLogout}
        onNewChat={handleNewChat}
      />

      <main className="main-pane">
        <div className="chat-messages" ref={messagesContainerRef}>
          {messages.length === 0 && (
            <div className="welcome">
              <div className="welcome-hero">
                <div className="welcome-badge">AI · ERP Analytics</div>
                <h2>你好，我是你的 ERP 分析助手 👋</h2>
                <p>我可以帮你分析采购订单、供应商绩效、价格偏差、三路匹配异常等业务数据。</p>
              </div>
              <div className="suggestions-grid">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.title}
                    onClick={() => handleSend(s.query, DEFAULT_SEND_OPTIONS)}
                    className="suggestion-card"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="suggestion-icon">{s.icon}</div>
                    <div className="suggestion-title">{s.title}</div>
                    <div className="suggestion-desc">{s.description}</div>
                    <div className="suggestion-arrow">→</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="examples-more-link"
                onClick={() => setExamplesOpen(true)}
              >
                示例太少？ 查看全部 28+ 问题库 →
              </button>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              userId={userId}
              onTraceClick={setActiveTraceId}
              onRegenerate={handleRegenerate}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <InputBar
          onSend={handleSend}
          disabled={loading}
          lastDurationMs={lastDurationMs}
          draftNonce={draft.nonce}
          draftText={draft.text}
          onOpenExamples={() => setExamplesOpen(true)}
          onOpenTips={() => setTipsOpen(true)}
        />
      </main>

      <FeedbackButton />

      <ExamplePromptsDrawer
        open={examplesOpen}
        onClose={() => setExamplesOpen(false)}
        onPick={handlePickExample}
      />

      <TestDataTipsModal open={tipsOpen} onClose={() => setTipsOpen(false)} />

      {activeTraceId && (
        <TraceModal traceId={activeTraceId} onClose={() => setActiveTraceId(null)} />
      )}

      {showLogin && (
        <Login
          onLogin={name => {
            onLogin(name);
            setShowLogin(false);
          }}
          onCancel={() => {
            setShowLogin(false);
            setPendingQuery(null);
          }}
        />
      )}
    </div>
  );
}
