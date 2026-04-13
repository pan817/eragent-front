import { useEffect, useRef, useState } from 'react';
import './FeedbackButton.css';

type FeedbackType = 'bug' | 'suggestion' | 'other';

interface FeedbackEntry {
  id: string;
  type: FeedbackType;
  content: string;
  timestamp: number;
}

const STORAGE_KEY = 'erp-agent-feedback-v1';

const TYPES: { key: FeedbackType; label: string; icon: string }[] = [
  { key: 'bug', label: 'Bug', icon: '🐛' },
  { key: 'suggestion', label: '建议', icon: '💡' },
  { key: 'other', label: '其他', icon: '💬' },
];

import { genId } from '../utils/id';
import { useFocusTrap } from '../hooks/useFocusTrap';

const saveFeedback = (entry: FeedbackEntry) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: FeedbackEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    // ignore
  }
};

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const reset = () => {
    setContent('');
    setType('suggestion');
    setSubmitted(false);
  };

  const handleClose = () => {
    setOpen(false);
    // Defer reset so the closing animation doesn't flicker
    setTimeout(reset, 250);
  };

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    saveFeedback({
      id: genId(),
      type,
      content: trimmed,
      timestamp: Date.now(),
    });
    setSubmitted(true);
    setContent('');
    // Auto close after short delay
    setTimeout(() => {
      setOpen(false);
      setTimeout(reset, 250);
    }, 1400);
  };

  const canSubmit = content.trim().length > 0 && !submitted;

  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        onClick={() => setOpen(true)}
        aria-label="提交反馈"
        title="提交反馈"
      >
        <span className="feedback-fab-text">Feedback</span>
      </button>

      {open && (
        <div className="modal-overlay" onClick={handleClose}>
          <div
            className="feedback-dialog"
            ref={dialogRef}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div className="feedback-dialog-header">
              <h3 id="feedback-title">提交反馈</h3>
              <button
                type="button"
                className="icon-btn feedback-close"
                onClick={handleClose}
                aria-label="关闭"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {submitted ? (
              <div className="feedback-success">
                <div className="feedback-success-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="feedback-success-text">已保存到本地，感谢反馈 🙏</div>
              </div>
            ) : (
              <>
                <div className="feedback-type-group">
                  {TYPES.map(t => (
                    <button
                      key={t.key}
                      type="button"
                      className={`feedback-type-chip ${type === t.key ? 'is-active' : ''}`}
                      onClick={() => setType(t.key)}
                    >
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
                <textarea
                  className="feedback-textarea"
                  placeholder="告诉我们你遇到的问题或建议..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={5}
                  maxLength={500}
                  autoFocus
                />
                <div className="feedback-dialog-footer">
                  <span className="feedback-char-count">{content.length} / 500</span>
                  <div className="feedback-actions">
                    <button type="button" className="btn-cancel" onClick={handleClose}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="feedback-submit"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                    >
                      提交
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
