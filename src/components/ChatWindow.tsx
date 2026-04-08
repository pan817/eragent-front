import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../types/api';
import { analyzeQuery } from '../services/api';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import TraceModal from './TraceModal';
import InitDataButton from './InitDataButton';
import ThemeToggle from './ThemeToggle';

const genId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const USER_ID = 'analyst-001';

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

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
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

  const handleSend = useCallback(async (query: string) => {
    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    const assistantId = genId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    setLoading(true);
    shouldAutoScroll.current = true;

    try {
      const res = await analyzeQuery({ query, user_id: USER_ID });

      const content =
        res.status === 'success'
          ? res.report_markdown || '分析完成，但未生成报告内容。'
          : `分析失败: ${res.error || '未知错误'}`;

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content,
                status: res.status === 'success' ? 'success' : 'error',
                durationMs: res.duration_ms,
                traceId: res.trace_id,
              }
            : m
        )
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接';
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: errorMsg, status: 'error' } : m))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRegenerate = useCallback(
    (assistantMsgId: string) => {
      const idx = messages.findIndex(m => m.id === assistantMsgId);
      if (idx <= 0) return;
      const userMsg = messages[idx - 1];
      if (userMsg.role !== 'user') return;
      setMessages(prev => prev.slice(0, idx - 1));
      setTimeout(() => handleSend(userMsg.content), 50);
    },
    [messages, handleSend]
  );

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

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="header-brand">
          <div className="brand-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 8.5v7L12 22l10-6.5v-7L12 2z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M12 22V12M2 8.5L12 15l10-6.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="header-text">
            <h1>ERP 智能分析助手</h1>
            <p>基于 AI 的采购与供应链数据分析</p>
          </div>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <InitDataButton />
        </div>
      </header>

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
                  onClick={() => handleSend(s.query)}
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
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onTraceClick={setActiveTraceId}
            onRegenerate={handleRegenerate}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <InputBar onSend={handleSend} disabled={loading} />

      {activeTraceId && (
        <TraceModal traceId={activeTraceId} onClose={() => setActiveTraceId(null)} />
      )}
    </div>
  );
}
