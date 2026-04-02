import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types/api';
import { analyzeQuery } from '../services/api';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';

const USER_ID = 'analyst-001';

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (query: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    setLoading(true);

    try {
      const res = await analyzeQuery({ query, user_id: USER_ID });

      const content = res.status === 'success'
        ? (res.report_markdown || '分析完成，但未生成报告内容。')
        : `分析失败: ${res.error || '未知错误'}`;

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content, status: res.status === 'success' ? 'success' : 'error', durationMs: res.duration_ms }
            : m
        )
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接';
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: errorMsg, status: 'error' }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>ERP 智能分析助手</h1>
        <p>基于AI的采购与供应链数据分析</p>
      </header>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="welcome">
            <div className="welcome-icon">📊</div>
            <h2>欢迎使用 ERP 智能分析助手</h2>
            <p>您可以询问关于采购、供应商、价格差异等方面的分析问题</p>
            <div className="suggestions">
              {[
                '分析最近的三路匹配异常情况',
                '分析所有供应商的采购价格差异',
                '查看最近30天的采购订单异常',
              ].map(text => (
                <button key={text} onClick={() => handleSend(text)} className="suggestion-btn">
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <InputBar onSend={handleSend} disabled={loading} />
    </div>
  );
}
