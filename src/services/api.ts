import type { AnalyzeRequest, AnalyzeResponse } from '../types/api';

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
