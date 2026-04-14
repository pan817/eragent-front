import { showToastOnce } from './toast';

/**
 * localStorage 包装：隐私模式/配额满等场景 setItem 会抛；
 * 包装后第一次失败弹一次 toast 提示用户，之后保持静默避免刷屏。
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    showToastOnce(
      'localStorage-set-fail',
      '浏览器本地存储不可用（可能是隐私模式或空间已满），部分偏好将无法跨会话保留',
      { level: 'warn', duration: 6000 },
    );
    return false;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 读写失败已由 set 时提示，remove 静默
  }
}
