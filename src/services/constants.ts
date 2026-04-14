const API_BASE = import.meta.env.VITE_API_BASE || '';

/** 所有后端 API 的公共路径前缀 */
export const API_PREFIX = `${API_BASE}/api/v1/ptp-agent`;

/**
 * 是否启用异步分析接口（POST /analyze/async + SSE）。
 * 默认开启；只有显式设 "false" 或 "0" 才走旧的同步 POST /analyze。
 */
export const USE_ASYNC_ANALYZE: boolean = (() => {
  const v = import.meta.env.VITE_USE_ASYNC_ANALYZE;
  return v !== 'false' && v !== '0';
})();
