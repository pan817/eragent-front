import type { AnalyzeRequest, AnalyzeResponse, TraceResponse } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function analyzeQuery(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/api/v1/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`);
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
  const response = await fetch(`${API_BASE}/api/v1/init-data`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getTrace(traceId: string): Promise<TraceResponse> {
  const response = await fetch(`${API_BASE}/api/v1/traces/${traceId}`);
  if (!response.ok) {
    throw new Error(`查询失败: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
