export interface AnalyzeRequest {
  query: string;
  user_id: string;
}

export interface AnalyzeResponse {
  report_id: string;
  status: string;
  analysis_type: string;
  query: string;
  user_id: string;
  session_id: string;
  time_range: string;
  anomalies: unknown[];
  supplier_kpis: unknown[];
  summary: Record<string, unknown>;
  report_markdown: string;
  error: string | null;
  completed_tasks: unknown[];
  failed_tasks: unknown[];
  created_at: string;
  duration_ms: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'success' | 'error';
  durationMs?: number;
}
