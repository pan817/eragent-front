import { useMemo, useState } from 'react';
import type { ChatMessage } from '../types/api';
import type { ChatSession } from '../hooks/useChatSessions';
import ThemeToggle from './ThemeToggle';
import InitDataButton from './InitDataButton';
import Avatar from './Avatar';
import './Sidebar.css';

interface SidebarProps {
  userId: string | null;
  messages: ChatMessage[];
  sessions: ChatSession[];
  currentId: string;
  filteredSessions: ChatSession[];
  search: string;
  onSearchChange: (v: string) => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onClearAll: () => void;
  onLoginClick: () => void;
  onLogout: () => void;
  onNewChat: () => void;
}

const formatRelativeTime = (ts: number): string => {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function Sidebar({
  userId,
  messages,
  sessions,
  currentId,
  filteredSessions,
  search,
  onSearchChange,
  onSwitchSession,
  onDeleteSession,
  onClearAll,
  onLoginClick,
  onLogout,
  onNewChat,
}: SidebarProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  const stats = useMemo(() => {
    const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.status === 'success');
    const queryCount = assistantMsgs.length;
    const totalMs = assistantMsgs.reduce((sum, m) => sum + (m.durationMs ?? 0), 0);
    const avgMs = queryCount > 0 ? totalMs / queryCount : 0;
    return { queryCount, totalMs, avgMs };
  }, [messages]);

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const hasAnySession = sessions.some(s => s.messageCount > 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
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
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-name">ERP Agent</div>
          <div className="sidebar-brand-sub">AI 采购分析助手</div>
        </div>
      </div>

      <button type="button" className="sidebar-new-chat" onClick={onNewChat}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>新建对话</span>
      </button>

      <div className="sidebar-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="搜索历史对话..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="sidebar-search-clear"
            onClick={() => onSearchChange('')}
            aria-label="清空搜索"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div className="sidebar-section-label">
        历史对话
        {hasAnySession && (
          <button
            type="button"
            className="sidebar-clear-all"
            onClick={() => setConfirmingClear(true)}
            title="清空全部对话"
          >
            清空
          </button>
        )}
      </div>
      <div className="sidebar-history">
        {filteredSessions.length === 0 ? (
          <div className="sidebar-history-empty">
            {search ? '未找到匹配对话' : '暂无历史对话'}
          </div>
        ) : (
          filteredSessions.map(s => {
            const isActive = s.id === currentId;
            const isEmpty = s.messageCount === 0;
            // 估算用户消息数：已加载的走精确计数，未加载的按消息数一半近似
            const userMsgCount =
              s.messages.length > 0
                ? s.messages.filter(m => m.role === 'user').length
                : Math.max(1, Math.ceil(s.messageCount / 2));
            return (
              <button
                key={s.id}
                type="button"
                className={`sidebar-history-item ${isActive ? 'is-active' : ''}`}
                onClick={() => onSwitchSession(s.id)}
              >
                <div className="sidebar-history-item-main">
                  <div className="sidebar-history-item-title">
                    {isEmpty ? <span className="is-muted">新对话</span> : s.title}
                  </div>
                  <div className="sidebar-history-item-meta">
                    <span>{formatRelativeTime(s.updatedAt)}</span>
                    {!isEmpty && <span>· {userMsgCount} 条</span>}
                  </div>
                </div>
                <button
                  type="button"
                  className="sidebar-history-item-delete"
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteSession(s.id);
                  }}
                  aria-label="删除对话"
                  title="删除对话"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </button>
            );
          })
        )}
      </div>

      <div className="sidebar-stats">
        <div className="sidebar-stats-title">本次会话统计</div>
        <div className="sidebar-stats-grid">
          <div className="sidebar-stat">
            <div className="sidebar-stat-value">{stats.queryCount}</div>
            <div className="sidebar-stat-label">查询次数</div>
          </div>
          <div className="sidebar-stat">
            <div className="sidebar-stat-value">{formatMs(stats.totalMs)}</div>
            <div className="sidebar-stat-label">累计耗时</div>
          </div>
          <div className="sidebar-stat">
            <div className="sidebar-stat-value">{formatMs(stats.avgMs)}</div>
            <div className="sidebar-stat-label">平均耗时</div>
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-tools">
          <ThemeToggle />
          <InitDataButton />
        </div>
        <div className="sidebar-user">
          {userId ? (
            <>
              <Avatar role="user" seed={userId} size={30} />
              <div className="sidebar-user-name" title={userId}>{userId}</div>
              <button
                type="button"
                className="sidebar-user-action"
                onClick={onLogout}
                title="退出登录"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </>
          ) : (
            <button type="button" className="sidebar-user-login" onClick={onLoginClick}>
              登录
            </button>
          )}
        </div>
      </div>

      {confirmingClear && (
        <div className="modal-overlay" onClick={() => setConfirmingClear(false)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3>清空全部历史对话？</h3>
            <p>此操作将删除本地保存的所有对话记录，且不可恢复。</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setConfirmingClear(false)}>
                取消
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  onClearAll();
                  setConfirmingClear(false);
                }}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
