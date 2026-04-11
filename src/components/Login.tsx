import { useState, useEffect, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

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
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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
    const p = password.trim();
    if (!u) {
      setError('请输入用户名');
      return;
    }
    if (!p) {
      setError('请输入密码');
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
      className="login-overlay"
      onClick={e => {
        if (e.target === e.currentTarget && onCancel) onCancel();
      }}
    >
      <div className="login-card" role="dialog" aria-modal="true">
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
          <h1>登录</h1>
          <p>请输入用户名，密码可任意填写</p>
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
              autoFocus={!username}
            />
          </label>

          <label className="login-field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="任意密码即可"
              autoFocus={!!username}
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit">
            登录
          </button>
        </form>
      </div>
    </div>
  );
}
