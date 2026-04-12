import type { AnalyzeRequest, AnalyzeResponse, TraceResponse } from '../types/api';
import { ApiError } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function analyzeQuery(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `HTTP_${response.status}`, `请求失败: ${response.status} ${response.statusText}`);
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
    response = await fetch(`${API_BASE}/api/v1/init-data`, { method: 'POST' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `HTTP_${response.status}`, `请求失败: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getTrace(traceId: string): Promise<TraceResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1/traces/${traceId}`);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '网络请求失败，请检查网络连接');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `HTTP_${response.status}`, `查询失败: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
