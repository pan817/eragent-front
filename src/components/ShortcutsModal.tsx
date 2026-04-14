import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './ShortcutsModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  desc: string;
}

const SHORTCUTS: { group: string; rows: ShortcutRow[] }[] = [
  {
    group: '通用',
    rows: [
      { keys: ['?'], desc: '打开快捷键面板' },
      { keys: ['Esc'], desc: '关闭当前弹窗/面板' },
    ],
  },
  {
    group: '输入',
    rows: [
      { keys: ['⌘/Ctrl', 'K'], desc: '聚焦输入框' },
      { keys: ['/'], desc: '浏览示例问题' },
      { keys: ['Enter'], desc: '发送（或换行，按偏好设置）' },
      { keys: ['Shift', 'Enter'], desc: '强制换行' },
    ],
  },
  {
    group: '会话',
    rows: [
      { keys: ['双击会话'], desc: '重命名当前会话' },
      { keys: ['↑', '↓'], desc: '在历史对话列表中移动' },
    ],
  },
];

export default function ShortcutsModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-content shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="shortcuts-title">键盘快捷键</h2>
          <button
            type="button"
            className="icon-btn modal-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="shortcuts-modal-body">
          {SHORTCUTS.map(section => (
            <div key={section.group} className="shortcuts-group">
              <div className="shortcuts-group-title">{section.group}</div>
              <div className="shortcuts-group-rows">
                {section.rows.map((r, i) => (
                  <div className="shortcuts-row" key={i}>
                    <div className="shortcuts-keys">
                      {r.keys.map((k, j) => (
                        <span key={j}>
                          {j > 0 && <span className="shortcuts-plus">+</span>}
                          <kbd>{k}</kbd>
                        </span>
                      ))}
                    </div>
                    <div className="shortcuts-desc">{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
