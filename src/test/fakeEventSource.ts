/**
 * vitest 下 EventSource 的轻量替身。
 *
 * Why: jsdom / node 环境都没有原生 EventSource，而 Q1 选的方案 A（原生 EventSource + URL query）
 * 要求 runAnalysisTask 里直接 `new EventSource(...)`。测试里必须能可控地触发事件。
 * How: installFakeEventSource() 返回 uninstall + 一个注册表，测试里拿到最后构造的实例后
 * 调 `emit(eventName, data)` / `error()` / `open()` 模拟服务端推事件。
 */

type EventListener = (ev: MessageEvent) => void;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  readyState: number = 0; // 0 CONNECTING, 1 OPEN, 2 CLOSED
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  private listeners = new Map<string, Set<EventListener>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = 2;
    this.closed = true;
  }

  // ---- 测试辅助：模拟服务端行为 ----

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  emit(eventName: string, data: unknown): void {
    const ev = new MessageEvent(eventName, {
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
    this.listeners.get(eventName)?.forEach(l => l(ev));
  }

  error(): void {
    this.onerror?.(new Event('error'));
  }
}

export function installFakeEventSource(): () => void {
  const original = (globalThis as { EventSource?: unknown }).EventSource;
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
  FakeEventSource.instances = [];
  return () => {
    (globalThis as { EventSource?: unknown }).EventSource = original;
    FakeEventSource.instances = [];
  };
}

/** 获取最后一次 new 出来的实例；大多数测试场景只会有一个 */
export function getLastEventSource(): FakeEventSource | undefined {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1];
}
