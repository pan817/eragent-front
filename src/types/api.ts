export interface AnalyzeRequest {
  query: string;
  user_id: string;
  session_id: string;
  /** 分析师角色：后端据此切换 system prompt / 分析侧重 */
  analyst_role?: 'general' | 'procurement' | 'finance' | 'supply';
  /** 输出模式：detailed（默认详细报告）/ brief（简报摘要）/ table（数据表格） */
  output_mode?: 'detailed' | 'brief' | 'table';
  /** 时间范围过滤：7d / 30d / 90d / this_month / last_month；不传则不限 */
  time_range?: string;
  /** 后端自动落库 user + assistant 两条消息；guest 模式传 false */
  auto_persist?: boolean;
  /** 对某条 assistant 消息重新生成，后端更新该消息而不是新建 */
  regenerate_of?: string | null;
  /** 前端乐观渲染用的临时 id，服务端原样回填到响应 */
  client_user_message_id?: string;
  client_assistant_message_id?: string;
  /** 请求级元信息，会写入两条消息的 metadata */
  metadata?: Record<string, unknown>;
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
  // 后端代写消息后返回的元信息（auto_persist=true 时存在）
  session?: ApiChatSession;
  user_message_id?: string;
  assistant_message_id?: string;
  client_user_message_id?: string;
  client_assistant_message_id?: string;
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

export interface ContextBudget {
  total_inject_tokens: number;
  model_context_limit: number;
  budget_usage_pct: number;
  route_type?: string;
  note?: string;
  /** 其余字段因路由类型而异，如 report_template_tokens / system_prompt_tokens 等 */
  [key: string]: unknown;
}

export interface TokenSummary {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  peak_prompt_tokens: number;
  context_budget?: ContextBudget;
}

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_token_details?: Record<string, unknown>;
  output_token_details?: Record<string, unknown>;
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
  token_summary?: TokenSummary;
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

// ============================================
// 后端 snake_case 类型 + 转换函数
// 对应 docs/chat_history_api_design.md 第 2 节
// ============================================

export interface ApiChatMessage {
  id: string;
  client_id?: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'sending' | 'success' | 'error';
  duration_ms: number | null;
  trace_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ApiChatSession {
  id: string;
  user_id: string;
  title: string;
  title_auto: boolean;
  message_count: number;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiMatchedSnippet {
  message_id: string;
  role: 'user' | 'assistant';
  snippet: string;
}

export interface ApiSessionListResponse {
  sessions: ApiChatSession[];
  next_cursor: string | null;
  total?: number;
}

export interface ApiSessionDetailResponse {
  session: ApiChatSession;
  messages: ApiChatMessage[];
  has_more_messages: boolean;
}

export interface ApiCreateSessionResponse {
  session: ApiChatSession;
}

export interface ApiAppendMessagesResponse {
  messages: ApiChatMessage[];
  session: ApiChatSession;
}

export interface ApiSearchResponse {
  sessions: (ApiChatSession & { matched_snippets?: ApiMatchedSnippet[] })[];
}

export interface ApiClearAllResponse {
  deleted_count: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** 前端已知错误码常量。后端返回的其他 code 原样保留在 ApiError.code。 */
export const ApiErrorCode = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  /** 生成 HTTP 状态码形式的 code，如 HTTP_500 */
  http: (status: number) => `HTTP_${status}`,
} as const;

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** 网络/超时等非业务错误（status=0）归为"连接类"，UI 层可据此给出统一提示 */
  isNetworkError(): boolean {
    return this.status === 0;
  }
}

// ---------- 映射：API → 前端 ----------

export function fromApiMessage(m: ApiChatMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: (!m.content && m.role === 'assistant')
      ? '该回复内容为空。'
      : (m.content || ''),
    timestamp: new Date(m.created_at),
    status: m.status,
    durationMs: m.duration_ms ?? undefined,
    traceId: m.trace_id ?? undefined,
  };
}

export interface FrontendSession {
  id: string;
  title: string;
  titleAuto: boolean;
  messageCount: number;
  lastMessagePreview: string | null;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[]; // 懒加载：列表接口不返回，详情接口才填充
}

export function fromApiSession(
  s: ApiChatSession,
  messages: ChatMessage[] = []
): FrontendSession {
  return {
    id: s.id,
    title: s.title,
    titleAuto: s.title_auto,
    messageCount: s.message_count,
    lastMessagePreview: s.last_message_preview,
    createdAt: Date.parse(s.created_at),
    updatedAt: Date.parse(s.updated_at),
    messages,
  };
}
