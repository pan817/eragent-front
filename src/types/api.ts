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
  /** 异步分析进行中，气泡内展示的当前阶段人话文案（由 stage/tool 事件驱动）。完成后丢弃。 */
  stageText?: string;
  /** 异步分析进行中，折叠时间线展示的事件条目（仅进行中可见，完成即丢）。 */
  timeline?: AnalysisTimelineEntry[];
  /** 异步流已降级为轮询（SSE 不工作或长期无业务事件）。UI 用于透明告知用户。 */
  degradedToPolling?: boolean;
  /** 刷新/切回 session 后恢复订阅的时间戳。气泡会显示"已恢复"横幅，N 秒后自动隐藏。 */
  resumedAt?: number;
  /** 失败时的错误码（TIMEOUT / INTENT_UNCLEAR 等）；决定是否展示重试按钮。 */
  errorCode?: string;
  /** LLM 流式输出：已进入 token 级推送状态。首个 chunk 到达时置 true，done 后清空。 */
  streaming?: boolean;
  /** LLM 流式输出：已累加的增量文本缓冲区。done 后由 report_markdown 覆盖到 content 并清空。 */
  chunkBuffer?: string;
  /** LLM 流式输出：已处理的最大 chunk.index；用于检测后端重试（index=0 倒退）与 gap 缺失。 */
  lastChunkIndex?: number;
  /** LLM 流式输出：检测到 chunk gap（index 非连续）。需等 done 拉快照覆盖，不再信任 chunkBuffer。 */
  chunkBroken?: boolean;
  /** 用户主动停止生成。status='success' + aborted=true 时，气泡保留已生成内容并在脚注显示"已停止生成"。 */
  aborted?: boolean;
}

/** 气泡折叠时间线里的一行（只保留 stage 和 tool 事件，heartbeat 忽略） */
export interface AnalysisTimelineEntry {
  ts: string;
  text: string;
  durationMs?: number;
  /**
   * 用于 start↔end 匹配的稳定 key（如 `tool:query_purchase_orders`）。
   * tool/dag_task 在 start 事件即入列为"进行中"，end 事件到达时按 matchKey 找最近一条
   * 尚未完成（无 durationMs）的条目就地回填文案与耗时；找不到则追加一条（容错）。
   * stage 等一次性事件不带 matchKey。
   */
  matchKey?: string;
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
  /** pending 仅在异步接口未完成时出现（文档 §6.2）；前端会在 fromApiMessage 映射为 sending */
  status: 'sending' | 'success' | 'error' | 'pending';
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
  /** 调用方主动 abort（上下文切换/组件卸载），UI 层不应以此弹错误提示 */
  ABORTED: 'ABORTED',
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
    status: m.status === 'pending' ? 'sending' : m.status,
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

// ============================================
// 异步分析接口类型（docs/async_analyze_frontend.md）
// ============================================

export type AnalysisTaskStatus = 'queued' | 'running' | 'ok' | 'error' | 'aborted';

export interface AnalysisTaskAck {
  trace_id: string;
  status: 'queued' | 'running';
  session_id: string;
  user_message_id?: string;
  assistant_message_id?: string;
  poll_url: string;
  stream_url: string;
  created_at: string;
}

export interface AnalysisTaskError {
  code: string;
  message: string;
}

export interface TaskSnapshot {
  trace_id: string;
  status: AnalysisTaskStatus;
  session_id: string;
  user_id: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  stage?: string;
  result?: AnalyzeResponse;
  error?: AnalysisTaskError;
}

interface BaseEvent {
  trace_id: string;
  ts: string;
  seq: number;
}

export interface StatusEvent extends BaseEvent {
  type: 'status';
  state: AnalysisTaskStatus;
}
export interface StageEvent extends BaseEvent {
  type: 'stage';
  name: string;
  label?: string;
  attrs?: Record<string, unknown>;
}
export interface ToolEvent extends BaseEvent {
  type: 'tool';
  action: 'start' | 'end';
  name: string;
  label?: string;
  duration_ms?: number;
  status?: string;
}
export interface DagTaskEvent extends BaseEvent {
  type: 'dag_task';
  action: 'start' | 'end';
  task_name: string;
  label?: string;
  duration_ms?: number;
  status?: string;
}
export interface ReportEvent extends BaseEvent {
  type: 'report';
  anomaly_count: number;
  duration_ms: number;
}
export interface HeartbeatEvent extends BaseEvent {
  type: 'heartbeat';
}
export interface ChunkEvent extends BaseEvent {
  type: 'chunk';
  /** 生成节点标识；Phase 1 只会出现 "report" */
  node: 'report' | 'agent_final' | string;
  /** 对应 assistant_message_id（字符串）。前端用这个 id 把 chunk 绑定到对应气泡 */
  message_id: string;
  /** 增量文本，直接 append（非累计） */
  delta: string;
  /** 该 message_id 内的 0-based 序号，单调递增；index=0 且 lastChunkIndex>0 视为重试重置 */
  index: number;
  /** 是否该 message 最后一个 chunk；true 时 delta 通常为空串 */
  eos?: boolean;
}
export interface DoneEvent extends BaseEvent {
  type: 'done';
  status: 'ok' | 'error' | 'aborted';
  duration_ms: number;
  anomaly_count?: number;
  error?: AnalysisTaskError;
}

export type AnalysisTaskEvent =
  | StatusEvent
  | StageEvent
  | ToolEvent
  | DagTaskEvent
  | ReportEvent
  | HeartbeatEvent
  | ChunkEvent
  | DoneEvent;

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
