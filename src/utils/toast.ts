export type ToastLevel = 'info' | 'warn' | 'error' | 'success';

export interface ToastItem {
  id: number;
  level: ToastLevel;
  message: string;
  duration: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  for (const l of listeners) l(items);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => {
    listeners.delete(listener);
  };
}

export function showToast(
  message: string,
  opts: { level?: ToastLevel; duration?: number } = {},
): number {
  const id = nextId++;
  const item: ToastItem = {
    id,
    level: opts.level ?? 'info',
    message,
    duration: opts.duration ?? (opts.level === 'error' ? 6000 : 3500),
  };
  items = [...items, item];
  emit();
  if (item.duration > 0) {
    window.setTimeout(() => dismissToast(id), item.duration);
  }
  return id;
}

export function dismissToast(id: number) {
  const before = items.length;
  items = items.filter(t => t.id !== id);
  if (items.length !== before) emit();
}

/** 测试辅助：清空所有 toast */
export function resetToasts() {
  items = [];
  emit();
}

/** 仅提示一次的 toast，防止重复告警（如 localStorage 持续失败） */
const oneShotKeys = new Set<string>();
export function showToastOnce(
  key: string,
  message: string,
  opts?: { level?: ToastLevel; duration?: number },
): void {
  if (oneShotKeys.has(key)) return;
  oneShotKeys.add(key);
  showToast(message, opts);
}
