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
  trace_id?: string;
}

export interface TraceSpan {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  span_type: string;
  name: string;
  status: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  attributes: Record<string, unknown>;
  error: string | null;
}

export interface TraceResponse {
  trace_id: string;
  agent_name: string;
  session_id: string;
  user_id: string;
  status: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  model_call_count: number;
  tool_call_count: number;
  error: string | null;
  spans: TraceSpan[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'success' | 'error';
  durationMs?: number;
  traceId?: string;
}
