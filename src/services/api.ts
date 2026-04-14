import type { AnalyzeRequest, AnalyzeResponse, TraceResponse } from '../types/api';
import { ApiError, ApiErrorCode } from '../types/api';
import { API_PREFIX } from './constants';

export async function analyzeQuery(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiError(0, ApiErrorCode.NETWORK_ERROR, '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    throw new ApiError(response.status, ApiErrorCode.http(response.status), `请求失败: ${response.status} ${response.statusText}`);
  }

  return response.json();
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

  return response.json();
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

  return response.json();
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
