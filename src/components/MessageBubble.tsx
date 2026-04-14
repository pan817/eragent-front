import { useState, useEffect, useMemo, useRef, memo, lazy, Suspense } from 'react';
import './MessageBubble.css';
import type { ChatMessage, AnalysisTimelineEntry } from '../types/api';
import Avatar from './Avatar';
import { formatRelativeTime } from '../utils/format';
import { getTypicalDurationMs } from '../utils/analysisDurationHistory';
import { escapeHtml } from '../utils/html';
import { showToast } from '../utils/toast';

/** 这些错误码重试只会再失败；不显示"重试"按钮，改为"换个问法"提示。 */
const RETRY_FORBIDDEN_CODES = new Set(['INTENT_UNCLEAR', 'NO_DATA']);

/** resumedAt 后横幅展示时长 */
const RESUME_BANNER_DURATION_MS = 3000;

const MarkdownContent = lazy(() => import('./MarkdownContent'));

interface Props {
  message: ChatMessage;
  userId?: string | null;
  onTraceClick?: (traceId: string) => void;
  onRegenerate?: (id: string) => void;
}

interface LoadingStagesProps {
  stageText?: string;
  timeline?: AnalysisTimelineEntry[];
  degradedToPolling?: boolean;
  resumedAt?: number;
  startedAt: Date;
}

function LoadingStages({
  stageText,
  timeline,
  degradedToPolling,
  resumedAt,
  startedAt,
}: LoadingStagesProps) {
  // 用户手动切换状态；U5: 第 1 条 timeline 到达时自动展开一次（user 手动收起后不再自动展）
  const [expanded, setExpanded] = useState(false);
  const autoExpandedRef = useRef(false);

  const timelineLength = timeline?.length ?? 0;
  useEffect(() => {
    if (!autoExpandedRef.current && timelineLength > 0) {
      autoExpandedRef.current = true;
      setExpanded(true);
    }
  }, [timelineLength]);

  // 每秒刷新"已用时 Xs"；typical 只在挂载时读一次
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.floor((Date.now() - startedAt.getTime()) / 1000)
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const typicalDurationMs = useMemo(() => getTypicalDurationMs(), []);

  // resumedAt 后 N 秒内展示"已恢复"横幅，之后淡出
  const [showResumeBanner, setShowResumeBanner] = useState(!!resumedAt);
  useEffect(() => {
    if (!resumedAt) return;
    setShowResumeBanner(true);
    const timer = setTimeout(
      () => setShowResumeBanner(false),
      RESUME_BANNER_DURATION_MS
    );
    return () => clearTimeout(timer);
  }, [resumedAt]);

  // 主文案优先级：stageText > (degraded ? "网络不稳定..." : "分析中")
  const mainText = stageText
    ? stageText
    : degradedToPolling
      ? '网络不稳定，正在查询结果'
      : '分析中';

  const timeHint = (() => {
    const parts: string[] = [`${elapsedSec}s`];
    if (typicalDurationMs) {
      parts.push(`通常 ${Math.round(typicalDurationMs / 1000)}s`);
    }
    return `(${parts.join(' / ')})`;
  })();

  const hasTimeline = timelineLength > 0;

  return (
    <div className="loading">
      {showResumeBanner && (
        <div className="loading-resume-banner" role="status">
          ↻ 已恢复上次未完成的分析
        </div>
      )}
      <div className="loading-header">
        <div className="loading-dots">
          <span /><span /><span />
        </div>
        <span className="loading-text" key={mainText}>{mainText}</span>
        <span className="loading-time-hint">{timeHint}</span>
        {hasTimeline && (
          <button
            type="button"
            className="loading-toggle"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? '收起分析步骤' : '展开分析步骤'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>
      {hasTimeline && expanded && (
        <ul className="loading-timeline">
          {timeline!.map((entry, idx) => (
            <li key={idx} className="loading-timeline-item">
              <span className="loading-timeline-ts">{formatTsHms(entry.ts)}</span>
              <span className="loading-timeline-text">{entry.text}</span>
              {entry.durationMs !== undefined && (
                <span className="loading-timeline-duration">{(entry.durationMs / 1000).toFixed(1)}s</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTsHms(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString('zh-CN', { hour12: false });
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

function MessageBubble({ message, userId, onTraceClick, onRegenerate }: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState<'md' | 'text' | false>(false);
  const [exportOpen, setExportOpen] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // U4: 某些错误码重试只会再失败（意图不清 / 无数据），改为提示"换个问法"
  const retryForbidden =
    !!message.errorCode && RETRY_FORBIDDEN_CODES.has(message.errorCode);

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
    } catch {
      // 非 HTTPS / 无权限 / iframe 内等都会抛。给用户一个明确反馈，别让"看起来啥也没发生"
      showToast('复制失败，请手动选中文本复制', { level: 'warn' });
    }
    setExportOpen(false);
  };

  const handleCopyPlainText = async () => {
    try {
      await navigator.clipboard.writeText(stripMarkdown(message.content));
      setCopied('text');
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('复制失败，请手动选中文本复制', { level: 'warn' });
    }
    setExportOpen(false);
  };

  const handleExportPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    // 找到当前消息渲染的 markdown 内容 DOM，克隆到新窗口用于打印。
    // CSS.escape：后端返回的 id 可能含 `"`/`]`/ 空格，不转义会让选择器抛异常或匹配错元素。
    const el = document.querySelector(
      `[data-msg-id="${CSS.escape(message.id)}"] .markdown-body`
    );
    // fallback 分支拼接的是 markdown 原文；若 content 含 `</pre><script>` 会在 window.open
    // 同源文档里执行 → XSS。这里用 escapeHtml 兜底（主分支 el.innerHTML 是 React 渲染后 DOM，
    // react-markdown 默认不允许 raw HTML，已安全）。
    const html = el ? el.innerHTML : `<pre>${escapeHtml(message.content)}</pre>`;
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
            <LoadingStages
              stageText={message.stageText}
              timeline={message.timeline}
              degradedToPolling={message.degradedToPolling}
              resumedAt={message.resumedAt}
              startedAt={message.timestamp}
            />
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
              <div className="error-block-hint">
                {retryForbidden
                  ? '这类问题重试也会得到相同结果，请尝试换一个问法'
                  : '请稍后重试，或检查网络连接'}
              </div>
              {onRegenerate && !retryForbidden && (
                <div className="error-block-actions">
                  <span className="error-block-time">{formatRelativeTime(message.timestamp)}</span>
                  <button
                    type="button"
                    className="error-block-retry"
                    onClick={() => onRegenerate(message.id)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                    点击重试
                  </button>
                </div>
              )}
              {retryForbidden && (
                <div className="error-block-actions">
                  <span className="error-block-time">{formatRelativeTime(message.timestamp)}</span>
                </div>
              )}
            </div>
          ) : (
            <Suspense fallback={<div className="markdown-body markdown-body--loading" aria-hidden="true" />}>
              <MarkdownContent content={message.content} />
            </Suspense>
          )}
        </div>

        {!isUser && message.status === 'success' && (
          <div className="message-toolbar">
            <span
              className="message-time"
              title={new Date(message.timestamp).toLocaleString()}
            >
              {formatRelativeTime(message.timestamp)}
            </span>
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
            <span
              className="message-time"
              title={new Date(message.timestamp).toLocaleString()}
            >
              {formatRelativeTime(message.timestamp)}
            </span>
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

export default memo(MessageBubble);
