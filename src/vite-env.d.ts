/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  /** 异步分析接口开关；默认开启（走 POST /analyze/async + SSE），显式设 "false"/"0" 才回落到旧同步 /analyze */
  readonly VITE_USE_ASYNC_ANALYZE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
