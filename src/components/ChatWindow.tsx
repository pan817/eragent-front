import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatSessions } from '../hooks/useChatSessions';
import { useMessageSending } from '../hooks/useMessageSending';
import MessageBubble from './MessageBubble';
import InputBar, { type SendOptions } from './InputBar';
import TraceModal from './TraceModal';
import Login from './Login';
import Sidebar from './Sidebar';
import FeedbackButton from './FeedbackButton';
import ExamplePromptsDrawer from './ExamplePromptsDrawer';
import TestDataTipsModal from './TestDataTipsModal';
import type { ExamplePrompt } from '../data/examplePrompts';
import { SUGGESTIONS } from '../data/chatConstants';

const DEFAULT_SEND_OPTIONS: SendOptions = {
  role: 'general',
  outputMode: 'detailed',
  timeRange: '',
};

interface ChatWindowProps {
  userId: string | null;
  onLogin: (username: string) => void;
  onLogout: () => void;
}

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
    renameSession,
    isGuestMode,
  } = useChatSessions(userId);

  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [draft, setDraft] = useState<{ text: string; nonce: number }>({ text: '', nonce: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const onNeedLogin = useCallback((query: string) => {
    setPendingQuery(query);
    setShowLogin(true);
  }, []);

  const { loading, handleSend, handleRegenerate, busyTip } = useMessageSending({
    userId,
    sessionId: currentId,
    messages,
    isGuestMode,
    setMessages,
    ensureRemoteSession,
    commitSessionFromAnalyze,
    onNeedLogin,
  });

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

  // 自动滚动到底部：发送消息时
  const handleSendWithScroll = useCallback(
    (query: string, options: SendOptions = DEFAULT_SEND_OPTIONS) => {
      shouldAutoScroll.current = true;
      return handleSend(query, options);
    },
    [handleSend]
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

  // Esc 关闭 TraceModal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeTraceId) setActiveTraceId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTraceId]);

  // 登录后自动继续发送暂存消息
  useEffect(() => {
    if (userId && pendingQuery) {
      const q = pendingQuery;
      setPendingQuery(null);
      handleSendWithScroll(q, DEFAULT_SEND_OPTIONS);
    }
  }, [userId, pendingQuery, handleSendWithScroll]);

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
        setDraft(d => ({ text: p.query, nonce: d.nonce + 1 }));
      } else {
        handleSendWithScroll(p.query, DEFAULT_SEND_OPTIONS);
      }
    },
    [handleSendWithScroll]
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
        onRenameSession={renameSession}
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
                    onClick={() => handleSendWithScroll(s.query, DEFAULT_SEND_OPTIONS)}
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
                示例太少？ 查看全部 56 条问题库 →
              </button>
            </div>
          )}

          {/* 当前 ERP 分析场景下单会话消息量有限，暂不引入虚拟列表；
              若未来支持长对话（>200条），考虑 react-window 虚拟化 */}
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

        {busyTip && (
          <div className="busy-tip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            正在分析中，请等待当前回复完成后再发送
          </div>
        )}

        <InputBar
          onSend={handleSendWithScroll}
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
