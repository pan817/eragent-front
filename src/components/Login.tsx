import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './Login.css';

interface LoginProps {
  onLogin: (username: string) => void;
  onCancel?: () => void;
}

const LAST_USERNAME_KEY = 'eragent_last_username';

export default function Login({ onLogin, onCancel }: LoginProps) {
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem(LAST_USERNAME_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  // ESC 关闭
  useEffect(() => {
    if (!onCancel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const submitLogin = () => {
    const u = username.trim();
    if (!u) {
      setError('请输入用户名');
      return;
    }
    setError('');
    try {
      localStorage.setItem(LAST_USERNAME_KEY, u);
    } catch {
      // ignore storage failures
    }
    onLogin(u);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitLogin();
  };

  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // IME composing（中文输入法确认候选词）不触发登录
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submitLogin();
  };

  return (
    <div
      className="modal-overlay login-overlay"
      onClick={e => {
        if (e.target === e.currentTarget && onCancel) onCancel();
      }}
    >
      <div
        className="login-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
        ref={dialogRef}
      >
        {onCancel && (
          <button
            type="button"
            className="login-close"
            onClick={onCancel}
            aria-label="关闭"
          >
            ×
          </button>
        )}
        <div className="login-brand">
          <div className="login-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
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
          <h1 id="login-dialog-title">登录</h1>
          <p>请输入用户名以开始使用</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label className="login-field">
            <span>用户名</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="请输入用户名"
              autoFocus
            />
          </label>

          {error && (
            <div className="login-error" role="alert">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-submit">
            登录
          </button>
        </form>
      </div>
    </div>
  );
}
