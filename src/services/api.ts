import type {
  AnalysisTaskAck,
  AnalyzeRequest,
  AnalyzeResponse,
  TaskSnapshot,
  TraceResponse,
} from '../types/api';
import { ApiError, ApiErrorCode } from '../types/api';
import { API_PREFIX } from './constants';

/**
 * 读取响应体并解析 JSON；body 不是合法 JSON（如网关 502 返回 nginx HTML）时抛 ApiError
 * 而不是让 SyntaxError 裸泄到调用方。调用方收到 ApiError 后可以走统一的错误文案路径。
 */
async function parseJsonOrThrow<T>(resp: Response, action: string): Promise<T> {
  try {
    return (await resp.json()) as T;
  } catch {
    throw new ApiError(
      resp.status || 0,
      'INVALID_RESPONSE',
      `${action}返回非 JSON 响应（可能是网关错误页）`
    );
  }
}

export async function analyzeQuery(
  request: AnalyzeRequest,
  opts: { signal?: AbortSignal } = {}
): Promise<AnalyzeResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(0, ApiErrorCode.ABORTED, 'request aborted');
    }
    throw new ApiError(0, ApiErrorCode.NETWORK_ERROR, '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    throw new ApiError(response.status, ApiErrorCode.http(response.status), `请求失败: ${response.status} ${response.statusText}`);
  }

  return parseJsonOrThrow<AnalyzeResponse>(response, '分析');
}

export interface InitDataResponse {
  status: string;
  message: string;
  seed: number;
  tables: Record<string, number>;
}

export async function initData(): Promise<InitDataResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}/init-data`, { method: 'POST' });
  } catch {
    throw new ApiError(0, ApiErrorCode.NETWORK_ERROR, '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    throw new ApiError(response.status, ApiErrorCode.http(response.status), `请求失败: ${response.status} ${response.statusText}`);
  }

  return parseJsonOrThrow<InitDataResponse>(response, '初始化');
}

export async function getTrace(traceId: string): Promise<TraceResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}/traces/${traceId}`);
  } catch {
    throw new ApiError(0, ApiErrorCode.NETWORK_ERROR, '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    throw new ApiError(response.status, ApiErrorCode.http(response.status), `查询失败: ${response.status} ${response.statusText}`);
  }

  return parseJsonOrThrow<TraceResponse>(response, '链路查询');
}

const traceCache = new Map<string, TraceResponse>();
const traceInflight = new Map<string, Promise<TraceResponse>>();

export function getTraceCached(traceId: string): Promise<TraceResponse> {
  const cached = traceCache.get(traceId);
  if (cached) return Promise.resolve(cached);
  const inflight = traceInflight.get(traceId);
  if (inflight) return inflight;
  const p = getTrace(traceId)
    .then(res => {
      traceCache.set(traceId, res);
      return res;
    })
    .finally(() => {
      traceInflight.delete(traceId);
    });
  traceInflight.set(traceId, p);
  return p;
}

export function primeTraceCache(traceId: string, data: TraceResponse): void {
  traceCache.set(traceId, data);
}

export function clearTraceCache(): void {
  traceCache.clear();
  traceInflight.clear();
}

// ============================================
// 异步分析接口（docs/async_analyze_frontend.md）
// ============================================

export async function submitAnalyzeAsync(
  request: AnalyzeRequest,
  opts: { signal?: AbortSignal } = {}
): Promise<AnalysisTaskAck> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}/analyze/async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(0, ApiErrorCode.ABORTED, 'request aborted');
    }
    throw new ApiError(0, ApiErrorCode.NETWORK_ERROR, '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    let code = ApiErrorCode.http(response.status);
    let message = `提交失败: ${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // 非 JSON 响应，保留默认文案
    }
    throw new ApiError(response.status, code, message);
  }

  return parseJsonOrThrow<AnalysisTaskAck>(response, '提交异步任务');
}

export async function fetchTaskSnapshot(
  traceId: string,
  opts: { signal?: AbortSignal } = {}
): Promise<TaskSnapshot> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}/analyze/tasks/${traceId}`, {
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(0, ApiErrorCode.ABORTED, 'request aborted');
    }
    throw new ApiError(0, ApiErrorCode.NETWORK_ERROR, '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      ApiErrorCode.http(response.status),
      `查询失败: ${response.status} ${response.statusText}`
    );
  }

  return parseJsonOrThrow<TaskSnapshot>(response, '查询任务快照');
}

/** SSE 端点 URL（给 EventSource 用）；鉴权走 URL query，当前项目无鉴权 */
export function taskEventStreamUrl(traceId: string): string {
  return `${API_PREFIX}/analyze/tasks/${traceId}/events`;
}
