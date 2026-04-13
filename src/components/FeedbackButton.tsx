import { useEffect, useRef, useState } from 'react';
import './FeedbackButton.css';
import { useFocusTrap } from '../hooks/useFocusTrap';

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
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

  const handleClose = () => setOpen(false);

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
              <h3 id="feedback-title">反馈</h3>
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

            <div className="feedback-coming-soon">
              <div className="feedback-coming-soon-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="feedback-coming-soon-title">功能未上线</div>
              <div className="feedback-coming-soon-text">反馈功能正在开发中，敬请期待！</div>
              <button type="button" className="feedback-coming-soon-btn" onClick={handleClose}>
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
