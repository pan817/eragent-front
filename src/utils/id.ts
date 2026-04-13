/** 生成唯一 ID（优先 crypto.randomUUID，降级到时间戳+随机数） */
export const genId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
