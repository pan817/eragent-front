import type {
  ApiAppendMessagesResponse,
  ApiChatMessage,
  ApiChatSession,
  ApiClearAllResponse,
  ApiCreateSessionResponse,
  ApiErrorBody,
  ApiSearchResponse,
  ApiSessionDetailResponse,
  ApiSessionListResponse,
} from '../types/api';
import { ApiError } from '../types/api';
import { API_PREFIX } from './constants';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  userId: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
  idempotencyKey?: string;
}

/**
 * 统一请求 helper。鉴权：所有 /sessions* 请求通过 X-User-Id header 传递用户身份，
 * 见 docs/chat_history_api_design.md 第 3.1 节。
 */
async function apiFetch<T>(path: string, opts: FetchOptions): Promise<T> {
  const method = opts.method ?? 'GET';
  const params = new URLSearchParams();

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
  }

  const queryStr = params.toString();
  const url = `${path}${queryStr ? `?${queryStr}` : ''}`;

  const headers: Record<string, string> = {
    'X-User-Id': opts.userId,
  };
  let body: string | undefined;
  if (method === 'POST' || method === 'PATCH') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body ?? {});
  }
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  let resp: Response;
  try {
    resp = await fetch(url, { method, headers, body });
  } catch (e) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      e instanceof Error ? e.message : '网络请求失败'
    );
  }

  if (resp.status === 204) {
    return undefined as T;
  }

  const text = await resp.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // 非 JSON 响应，直接抛
      throw new ApiError(resp.status, 'INVALID_RESPONSE', text.slice(0, 200));
    }
  }

  if (!resp.ok) {
    const errBody = parsed as ApiErrorBody | null;
    const code = errBody?.error?.code ?? `HTTP_${resp.status}`;
    const message = errBody?.error?.message ?? `请求失败: ${resp.status}`;
    throw new ApiError(resp.status, code, message, errBody?.error?.details);
  }

  return (parsed ?? undefined) as T;
}

// ============================================
// 4.1 列出会话
// ============================================

export function listSessions(
  userId: string,
  opts: { limit?: number; cursor?: string } = {}
): Promise<ApiSessionListResponse> {
  return apiFetch<ApiSessionListResponse>(`${API_PREFIX}/sessions`, {
    method: 'GET',
    userId,
    query: { limit: opts.limit, cursor: opts.cursor },
  });
}

// ============================================
// 4.2 创建会话
// ============================================

export function createSession(
  userId: string,
  opts: { title?: string; idempotencyKey?: string } = {}
): Promise<ApiCreateSessionResponse> {
  return apiFetch<ApiCreateSessionResponse>(`${API_PREFIX}/sessions`, {
    method: 'POST',
    userId,
    body: opts.title !== undefined ? { title: opts.title } : {},
    idempotencyKey: opts.idempotencyKey,
  });
}

// ============================================
// 4.3 获取会话详情
// ============================================

export function getSession(
  userId: string,
  sessionId: string,
  opts: { messageLimit?: number } = {}
): Promise<ApiSessionDetailResponse> {
  return apiFetch<ApiSessionDetailResponse>(`${API_PREFIX}/sessions/${sessionId}`, {
    method: 'GET',
    userId,
    query: { message_limit: opts.messageLimit },
  });
}

// ============================================
// 4.4 更新会话标题
// ============================================

export function updateSessionTitle(
  userId: string,
  sessionId: string,
  title: string | null
): Promise<{ session: ApiChatSession }> {
  return apiFetch<{ session: ApiChatSession }>(`${API_PREFIX}/sessions/${sessionId}`, {
    method: 'PATCH',
    userId,
    body: { title },
  });
}

// ============================================
// 4.5 删除单个会话
// ============================================

export function deleteSession(userId: string, sessionId: string): Promise<void> {
  return apiFetch<void>(`${API_PREFIX}/sessions/${sessionId}`, {
    method: 'DELETE',
    userId,
  });
}

// ============================================
// 4.6 清空全部会话
// ============================================

export function clearAllSessions(userId: string): Promise<ApiClearAllResponse> {
  return apiFetch<ApiClearAllResponse>(`${API_PREFIX}/sessions`, {
    method: 'DELETE',
    userId,
    query: { confirm: 'DELETE_ALL' },
  });
}

// ============================================
// 4.7 追加消息（补偿通道）
// ============================================

export interface AppendMessagePayload {
  role: 'user' | 'assistant';
  content: string;
  client_id?: string;
  status?: 'sending' | 'success' | 'error';
  duration_ms?: number;
  trace_id?: string;
  metadata?: Record<string, unknown>;
}

export function appendMessages(
  userId: string,
  sessionId: string,
  messages: AppendMessagePayload[],
  idempotencyKey?: string
): Promise<ApiAppendMessagesResponse> {
  return apiFetch<ApiAppendMessagesResponse>(
    `${API_PREFIX}/sessions/${sessionId}/messages`,
    {
      method: 'POST',
      userId,
      body: { messages },
      idempotencyKey,
    }
  );
}

// ============================================
// 4.8 更新消息
// ============================================

export interface UpdateMessagePayload {
  content?: string;
  status?: 'sending' | 'success' | 'error';
  duration_ms?: number | null;
  trace_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function updateMessage(
  userId: string,
  sessionId: string,
  messageId: string,
  patch: UpdateMessagePayload
): Promise<{ message: ApiChatMessage }> {
  return apiFetch<{ message: ApiChatMessage }>(
    `${API_PREFIX}/sessions/${sessionId}/messages/${messageId}`,
    {
      method: 'PATCH',
      userId,
      body: patch as Record<string, unknown>,
    }
  );
}

// ============================================
// 4.9 搜索会话
// ============================================

export function searchSessions(
  userId: string,
  q: string,
  opts: { limit?: number; scope?: 'title' | 'content' | 'all' } = {}
): Promise<ApiSearchResponse> {
  return apiFetch<ApiSearchResponse>(`${API_PREFIX}/sessions/search`, {
    method: 'GET',
    userId,
    query: { q, limit: opts.limit, scope: opts.scope },
  });
}
