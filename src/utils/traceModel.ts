import type { ModelUsage } from '../types/api';

// ============================================
// 常量
// ============================================

export const SPAN_TYPE_COLORS: Record<string, string> = {
  agent: '#6366f1',
  model: '#10b981',
  tool: '#f59e0b',
};

export const BUDGET_PIE_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899',
  '#14b8a6', '#a855f7', '#f97316', '#06b6d4',
];
export const BUDGET_REMAINING_COLOR = '#e2e8f0';

export const BUDGET_SKIP_KEYS = new Set([
  'route_type', 'total_inject_tokens', 'model_context_limit',
  'budget_usage_pct', 'note',
  'long_term_memory_count', 'checkpointer_message_count',
]);

export const BUDGET_KEY_LABELS: Record<string, string> = {
  report_template_tokens: '报告模板',
  long_term_memory_tokens: '长期记忆',
  short_term_memory_tokens: '短期记忆',
  user_message_tokens: '用户消息',
  system_prompt_tokens: '系统提示',
  ontology_context_tokens: '本体上下文',
  tool_definitions_tokens: '工具定义',
  checkpointer_history_tokens: '检查点历史',
};

export const ROLE_LABELS: Record<string, string> = {
  human: '用户消息',
  ai: 'AI 回复',
  tool: '工具输出',
  system: '系统提示',
};

export const ROLE_COLORS: Record<string, string> = {
  human: '#3b82f6',
  ai: '#6366f1',
  tool: '#f59e0b',
  system: '#10b981',
};

// ============================================
// 类型
// ============================================

export interface ModelSpanRow {
  spanId: string;
  name: string;
  durationMs: number;
  usage: ModelUsage | null;
  estimated: boolean;
}

export interface PieSlice {
  name: string;
  value: number;
  color: string;
}

// ============================================
// 纯函数
// ============================================

const USAGE_META_RE =
  /usage_metadata=\{['"]input_tokens['"]: (\d+),\s*['"]output_tokens['"]: (\d+),\s*['"]total_tokens['"]: (\d+)/;

const TOKEN_USAGE_RE =
  /token_usage['"]: \{['"]completion_tokens['"]: (\d+),\s*['"]prompt_tokens['"]: (\d+),\s*['"]total_tokens['"]: (\d+)/;

/**
 * 把后端返回的 usage 对象归一化成 ModelUsage。
 * 兼容 Anthropic 风格 (input_tokens/output_tokens) 和 OpenAI 风格 (prompt_tokens/completion_tokens)。
 * 字段缺失或类型不符则返回 null，让调用方降级到正则/估算路径，
 * 避免下游 `.toLocaleString()` 读到 undefined 崩溃。
 */
function toModelUsage(u: Record<string, unknown>): ModelUsage | null {
  if (
    typeof u.input_tokens === 'number' &&
    typeof u.output_tokens === 'number' &&
    typeof u.total_tokens === 'number'
  ) {
    return u as unknown as ModelUsage;
  }
  if (
    typeof u.prompt_tokens === 'number' &&
    typeof u.completion_tokens === 'number' &&
    typeof u.total_tokens === 'number'
  ) {
    return {
      input_tokens: u.prompt_tokens,
      output_tokens: u.completion_tokens,
      total_tokens: u.total_tokens,
    };
  }
  return null;
}

export function extractModelUsage(
  attrs: Record<string, unknown>,
): { usage: ModelUsage | null; estimated: boolean } {
  // 路径1a: 结构化 attributes.usage（DAG 路由）
  if (attrs.usage && typeof attrs.usage === 'object') {
    const usage = toModelUsage(attrs.usage as Record<string, unknown>);
    if (usage) return { usage, estimated: false };
  }

  // 路径1b: 结构化 attributes.output.usage（新版后端格式）
  const output = attrs.output as Record<string, unknown> | undefined;
  if (output && typeof output === 'object' && output.usage && typeof output.usage === 'object') {
    const usage = toModelUsage(output.usage as Record<string, unknown>);
    if (usage) return { usage, estimated: false };
  }

  // 路径2: 从 output.content 字符串中正则提取
  if (output && typeof output === 'object' && typeof output.content === 'string') {
    const m = output.content.match(USAGE_META_RE);
    if (m) {
      return {
        usage: { input_tokens: +m[1], output_tokens: +m[2], total_tokens: +m[3] },
        estimated: false,
      };
    }
    const m2 = output.content.match(TOKEN_USAGE_RE);
    if (m2) {
      return {
        usage: { input_tokens: +m2[2], output_tokens: +m2[1], total_tokens: +m2[3] },
        estimated: false,
      };
    }
  }

  // 路径3: estimated_input_tokens 兜底
  if (typeof attrs.estimated_input_tokens === 'number') {
    return {
      usage: {
        input_tokens: attrs.estimated_input_tokens,
        output_tokens: 0,
        total_tokens: attrs.estimated_input_tokens,
      },
      estimated: true,
    };
  }

  // 路径4: 完全无数据
  return { usage: null, estimated: false };
}

/** 粗估字符串的 token 数（中英混合约 1 char ≈ 0.6 token） */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.6);
}

/** 为某个 model span 构建饼图数据 */
export function buildModelPieData(attrs: Record<string, unknown>): PieSlice[] | null {
  const input = attrs.input;

  // 情况1: input 是 messages 数组 → 按 role 分组
  if (Array.isArray(input) && input.length > 0 && typeof input[0] === 'object') {
    const roleMap = new Map<string, number>();
    for (const msg of input) {
      const role = (msg as Record<string, unknown>).role as string ?? 'unknown';
      const content = String((msg as Record<string, unknown>).content ?? '');
      roleMap.set(role, (roleMap.get(role) ?? 0) + estimateTokens(content));
    }
    const slices: PieSlice[] = [];
    for (const [role, tokens] of roleMap) {
      if (tokens > 0) {
        slices.push({
          name: ROLE_LABELS[role] || role,
          value: tokens,
          color: ROLE_COLORS[role] || '#94a3b8',
        });
      }
    }
    const { usage } = extractModelUsage(attrs);
    if (usage && usage.output_tokens > 0) {
      slices.push({ name: 'Output', value: usage.output_tokens, color: '#ec4899' });
    }
    return slices.length > 0 ? slices : null;
  }

  // 情况2: input 是纯字符串 → Input vs Output
  if (typeof input === 'string') {
    const { usage } = extractModelUsage(attrs);
    const inputTokens = usage?.input_tokens ?? estimateTokens(input);
    const outputTokens = usage?.output_tokens ?? 0;
    const slices: PieSlice[] = [
      { name: 'Input', value: inputTokens, color: '#6366f1' },
    ];
    if (outputTokens > 0) {
      slices.push({ name: 'Output', value: outputTokens, color: '#ec4899' });
    }
    return slices;
  }

  return null;
}
