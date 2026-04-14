import { useState, useEffect, useRef } from 'react';
import './MessageBubble.css';
import type { ChatMessage } from '../types/api';
import MarkdownContent from './MarkdownContent';
import Avatar from './Avatar';
import { formatRelativeTime } from '../utils/format';

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

/** 每条 loading 阶段文字的展示时长（ms） */
const LOADING_STAGE_INTERVAL = 1800;

function LoadingStages() {
  const [stageIdx, setStageIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setStageIdx(i => (i + 1) % LOADING_STAGES.length);
    }, LOADING_STAGE_INTERVAL);
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

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '  - ')
    .replace(/^\s*\d+\.\s+/gm, (m) => m)
    .replace(/^>\s+/gm, '')
    .replace(/---+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function MessageBubble({ message, userId, onTraceClick, onRegenerate }: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState<'md' | 'text' | false>(false);
  const [retrying, setRetrying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const prevStatus = useRef(message.status);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // 当 status 从非 sending 变为 sending（重试触发），显示 retrying 态
  // 当 status 离开 sending（请求完成），清除 retrying 态
  useEffect(() => {
    if (prevStatus.current !== 'sending' && message.status === 'sending') {
      setRetrying(true);
    }
    if (prevStatus.current === 'sending' && message.status !== 'sending') {
      setRetrying(false);
    }
    prevStatus.current = message.status;
  }, [message.status]);

  // 清理 copy 计时器，避免卸载后 setState
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    };
  }, []);

  // 点击外部关闭导出菜单
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied('md');
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
    setExportOpen(false);
  };

  const handleCopyPlainText = async () => {
    try {
      await navigator.clipboard.writeText(stripMarkdown(message.content));
      setCopied('text');
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
    setExportOpen(false);
  };

  const handleExportPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    // 找到当前消息渲染的 markdown 内容 DOM，克隆到新窗口用于打印
    const el = document.querySelector(`[data-msg-id="${message.id}"] .markdown-body`);
    const html = el ? el.innerHTML : `<pre>${message.content}</pre>`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>分析报告</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:40px;color:#1e293b;line-height:1.7;max-width:800px;margin:0 auto}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left}th{background:#f1f5f9}
pre{background:#f1f5f9;padding:12px;border-radius:6px;overflow-x:auto;font-size:13px}
code{background:#f1f5f9;padding:2px 4px;border-radius:3px;font-size:13px}
h1,h2,h3{margin-top:24px;margin-bottom:8px}
@media print{body{padding:20px}}</style>
</head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
    setExportOpen(false);
  };


  const copyAnnouncement =
    copied === 'md' ? '已复制 Markdown' : copied === 'text' ? '已复制纯文本' : '';

  return (
    <div className={`message-row ${isUser ? 'message-row-user' : 'message-row-assistant'}`} data-msg-id={message.id}>
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
            <div className="error-block">
              <div className="error-block-content">
                <svg className="error-block-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{message.content}</span>
              </div>
              <div className="error-block-hint">请稍后重试，或检查网络连接</div>
              {onRegenerate && (
                <div className="error-block-actions">
                  <span className="error-block-time">{formatRelativeTime(message.timestamp)}</span>
                  <button
                    type="button"
                    className="error-block-retry"
                    onClick={() => onRegenerate(message.id)}
                    disabled={retrying}
                  >
                    {retrying ? (
                      <>
                        <span className="error-retry-spinner" />
                        重试中...
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
                          <path d="M21 3v5h-5" />
                        </svg>
                        点击重试
                      </>
                    )}
                  </button>
                </div>
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
            <div className="export-menu-wrap" ref={exportRef}>
              <button
                className="toolbar-btn"
                onClick={() => setExportOpen(v => !v)}
                title="导出 / 复制"
              >
                {copied ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {copied === 'md' ? '已复制 Markdown' : '已复制纯文本'}
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    导出
                  </>
                )}
              </button>
              {exportOpen && (
                <div className="export-dropdown">
                  <button className="export-dropdown-item" onClick={handleCopyMarkdown}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    复制 Markdown
                  </button>
                  <button className="export-dropdown-item" onClick={handleCopyPlainText}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    复制纯文本
                  </button>
                  <button className="export-dropdown-item" onClick={handleExportPdf}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    打印 / 导出 PDF
                  </button>
                </div>
              )}
            </div>
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
        {copyAnnouncement && (
          <span className="sr-only" role="status" aria-live="polite">
            {copyAnnouncement}
          </span>
        )}
      </div>
    </div>
  );
}
