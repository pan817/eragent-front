import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '../types/api';
import type { ChatSession } from '../hooks/useChatSessions';
import ThemeToggle from './ThemeToggle';
import InitDataButton from './InitDataButton';
import Avatar from './Avatar';
import { formatMs } from '../utils/format';
import { formatRelativeTimeFromTs } from '../utils/format';
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
  onRenameSession: (id: string, newTitle: string) => void;
  onClearAll: () => void;
  onLoginClick: () => void;
  onLogout: () => void;
  onNewChat: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenShortcuts?: () => void;
  /** 正在跑任务的 sessionId 集合，用于列表项显示 loading 指示 */
  busySessions?: Set<string>;
}


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
  onRenameSession,
  onClearAll,
  onLoginClick,
  onLogout,
  onNewChat,
  collapsed,
  onToggleCollapse,
  onOpenShortcuts,
  busySessions,
}: SidebarProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const preEditFocusRef = useRef<HTMLElement | null>(null);

  // 进入编辑态时聚焦并全选
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const startEditing = (id: string, currentTitle: string) => {
    const active = document.activeElement;
    preEditFocusRef.current =
      active instanceof HTMLElement && active.getAttribute('role') === 'option'
        ? active
        : (document.querySelector<HTMLElement>(`[data-session-id="${id}"]`) ?? null);
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const restoreFocusAfterEdit = (id: string | null) => {
    const target =
      preEditFocusRef.current ??
      (id ? document.querySelector<HTMLElement>(`[data-session-id="${id}"]`) : null);
    preEditFocusRef.current = null;
    if (target) {
      requestAnimationFrame(() => target.focus());
    }
  };

  const commitEdit = () => {
    if (!editingId) return;
    const id = editingId;
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== editingId) {
      onRenameSession(id, trimmed);
    }
    setEditingId(null);
    setEditingTitle('');
    restoreFocusAfterEdit(id);
  };

  const cancelEdit = () => {
    const id = editingId;
    setEditingId(null);
    setEditingTitle('');
    restoreFocusAfterEdit(id);
  };

  const stats = useMemo(() => {
    const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.status === 'success');
    const queryCount = assistantMsgs.length;
    const totalMs = assistantMsgs.reduce((sum, m) => sum + (m.durationMs ?? 0), 0);
    const avgMs = queryCount > 0 ? totalMs / queryCount : 0;
    return { queryCount, totalMs, avgMs };
  }, [messages]);


  const hasAnySession = sessions.some(s => s.messageCount > 0);

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
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
        {!collapsed && (
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">ERP Agent</div>
            <div className="sidebar-brand-sub">AI 采购分析助手</div>
          </div>
        )}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      <button type="button" className="sidebar-new-chat" onClick={onNewChat}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {!collapsed && <span>新建对话</span>}
      </button>

      <div className="sidebar-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="搜索历史对话..."
          aria-label="搜索历史对话"
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
      <div
        className="sidebar-history"
        role="listbox"
        aria-label="历史对话"
        onKeyDown={e => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]'));
          if (items.length === 0) return;
          const idx = items.findIndex(el => el === document.activeElement);
          const next = e.key === 'ArrowDown'
            ? (idx + 1) % items.length
            : (idx - 1 + items.length) % items.length;
          items[next].focus();
        }}
      >
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
            const isEditing = editingId === s.id;
            return (
              <div
                key={s.id}
                role="option"
                tabIndex={0}
                aria-selected={isActive}
                data-session-id={s.id}
                className={`sidebar-history-item ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  if (!isEditing) onSwitchSession(s.id);
                }}
                onKeyDown={e => {
                  if (isEditing) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSwitchSession(s.id); }
                }}
                onDoubleClick={e => {
                  e.stopPropagation();
                  if (!isEmpty) startEditing(s.id, s.title);
                }}
              >
                <div className="sidebar-history-item-main">
                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      className="sidebar-history-item-edit"
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                        e.stopPropagation();
                      }}
                      onBlur={commitEdit}
                      onClick={e => e.stopPropagation()}
                      maxLength={80}
                    />
                  ) : (
                    <div
                      className="sidebar-history-item-title"
                      title={isEmpty ? undefined : s.title}
                    >
                      {busySessions?.has(s.id) && (
                        <span
                          className="sidebar-busy-dot"
                          aria-label="正在分析"
                          title="该会话有任务正在分析中"
                        />
                      )}
                      {isEmpty ? <span className="is-muted">新对话</span> : s.title}
                    </div>
                  )}
                  {!isEditing && (
                    <div className="sidebar-history-item-meta">
                      <span title={new Date(s.updatedAt).toLocaleString()}>
                        {formatRelativeTimeFromTs(s.updatedAt)}
                      </span>
                      {!isEmpty && <span>· {userMsgCount} 条</span>}
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <div className="sidebar-history-item-actions">
                    <button
                      type="button"
                      className="sidebar-history-item-btn sidebar-history-item-edit-btn"
                      onClick={e => {
                        e.stopPropagation();
                        if (!isEmpty) startEditing(s.id, s.title);
                      }}
                      aria-label="重命名对话"
                      title="重命名"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="sidebar-history-item-btn sidebar-history-item-delete"
                      onClick={e => {
                        e.stopPropagation();
                        setConfirmingDeleteId(s.id);
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
                  </div>
                )}
              </div>
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
          <div className="sidebar-shortcuts-wrap">
            <button
              type="button"
              className="icon-btn sidebar-shortcuts-btn"
              aria-label="快捷键"
              title="快捷键（按 ? 打开）"
              onClick={onOpenShortcuts}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8" />
              </svg>
            </button>
            <div className="sidebar-shortcuts-tooltip">
              <div className="shortcuts-title">快捷键</div>
              <div className="shortcuts-row"><kbd>⌘/Ctrl+K</kbd><span>聚焦输入框</span></div>
              <div className="shortcuts-row"><kbd>/</kbd><span>浏览示例问题</span></div>
              <div className="shortcuts-row"><kbd>Esc</kbd><span>关闭弹窗</span></div>
              <div className="shortcuts-row"><kbd>双击会话</kbd><span>重命名</span></div>
            </div>
          </div>
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
                aria-label="退出登录"
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
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
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

      {confirmingDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmingDeleteId(null)}>
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3>删除这条对话？</h3>
            <p>删除后不可恢复，确认继续吗？</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setConfirmingDeleteId(null)}>
                取消
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  onDeleteSession(confirmingDeleteId);
                  setConfirmingDeleteId(null);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
