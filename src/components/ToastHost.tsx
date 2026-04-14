import { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast, type ToastItem } from '../utils/toast';
import './ToastHost.css';

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="toast-host" role="region" aria-label="通知">
      {items.map(t => (
        <div
          key={t.id}
          className={`toast toast--${t.level}`}
          role={t.level === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-message">{t.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismissToast(t.id)}
            aria-label="关闭通知"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
