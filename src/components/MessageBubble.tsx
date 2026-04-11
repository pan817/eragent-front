import { useState, useEffect } from 'react';
import type { ChatMessage } from '../types/api';
import MarkdownContent from './MarkdownContent';
import Avatar from './Avatar';

interface Props {
  message: ChatMessage;
  userId?: string | null;
  onTraceClick?: (traceId: string) => void;
  onRegenerate?: (id: string) => void;
}

const LOADING_STAGES = [
  '🔍 正在理解你的问题...',
  '📡 正在查询业务数据...',
  '📊 正在计算指标与异常...',
  '✍️ 正在生成分析报告...',
];

function formatRelativeTime(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 10) return '刚刚';
  if (diff < 60) return `${Math.floor(diff)} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return date.toLocaleDateString();
}

function LoadingStages() {
  const [stageIdx, setStageIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setStageIdx(i => (i + 1) % LOADING_STAGES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="loading">
      <div className="loading-dots">
        <span /><span /><span />
      </div>
      <span className="loading-text" key={stageIdx}>{LOADING_STAGES[stageIdx]}</span>
    </div>
  );
}

export default function MessageBubble({ message, userId, onTraceClick, onRegenerate }: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className={`message-row ${isUser ? 'message-row-user' : 'message-row-assistant'}`}>
      {isUser ? (
        <Avatar role="user" seed={userId} size={36} />
      ) : (
        <Avatar role="assistant" size={36} />
      )}
      <div className="message-column">
        <div className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
          {isUser ? (
            <p className="user-text">{message.content}</p>
          ) : message.status === 'sending' ? (
            <LoadingStages />
          ) : message.status === 'error' ? (
            <div className="error-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{message.content}</span>
              {onRegenerate && (
                <button
                  type="button"
                  className="error-retry-btn"
                  onClick={() => onRegenerate(message.id)}
                  title="重新发送该问题"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  重试
                </button>
              )}
            </div>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>

        {!isUser && message.status === 'success' && (
          <div className="message-toolbar">
            <span className="message-time">{formatRelativeTime(message.timestamp)}</span>
            {message.durationMs && (
              <>
                <span className="toolbar-sep">·</span>
                <span className="message-duration">
                  ⚡ {(message.durationMs / 1000).toFixed(1)}s
                </span>
              </>
            )}
            {message.traceId && onTraceClick && (
              <>
                <span className="toolbar-sep">·</span>
                <button
                  className="toolbar-btn"
                  onClick={() => onTraceClick(message.traceId!)}
                  title="查看调用链耗时分布"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  耗时详情
                </button>
              </>
            )}
            <div className="toolbar-spacer" />
            <button className="toolbar-btn" onClick={handleCopy} title="复制 Markdown">
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  已复制
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  复制
                </>
              )}
            </button>
            {onRegenerate && (
              <button className="toolbar-btn" onClick={() => onRegenerate(message.id)} title="重新生成">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                重新生成
              </button>
            )}
          </div>
        )}

        {isUser && (
          <div className="message-toolbar message-toolbar-user">
            <span className="message-time">{formatRelativeTime(message.timestamp)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
