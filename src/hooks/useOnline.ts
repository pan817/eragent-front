import { useEffect, useState } from 'react';

/**
 * 订阅浏览器在线/离线状态。
 * 返回 true 表示在线。初始读自 navigator.onLine（SSR 时兜底 true）。
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
