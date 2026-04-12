import { useEffect, useMemo, useRef, useState } from 'react';
import type { TraceResponse, ContextBudget, ModelUsage } from '../types/api';
import { getTrace } from '../services/api';
import {
  buildTree,
  flatten,
  calcTicks,
  formatTickLabel,
  positionSpan,
  type FlatNode,
} from '../utils/traceTree';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip,
} from 'recharts';

interface Props {
  traceId: string;
  onClose: () => void;
  /** 当前 session 中所有 assistant 消息的 traceId 列表（用于趋势图） */
  sessionTraceIds?: string[];
  /** Budget 使用率告警阈值（百分比），默认 80 */
  budgetWarningThreshold?: number;
}

const SPAN_TYPE_COLORS: Record<string, string> = {
  agent: '#6366f1',
  model: '#10b981',
  tool: '#f59e0b',
};

const BUDGET_PIE_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899',
  '#14b8a6', '#a855f7', '#f97316', '#06b6d4',
];
const BUDGET_REMAINING_COLOR = '#e2e8f0';

/** 不作为饼图切片展示的 context_budget 字段 */
const BUDGET_SKIP_KEYS = new Set([
  'route_type', 'total_inject_tokens', 'model_context_limit',
  'budget_usage_pct', 'note',
  'long_term_memory_count', 'checkpointer_message_count',
]);

/** 将 snake_case key 转为可读的中文标签 */
const BUDGET_KEY_LABELS: Record<string, string> = {
  report_template_tokens: '报告模板',
  long_term_memory_tokens: '长期记忆',
  short_term_memory_tokens: '短期记忆',
  user_message_tokens: '用户消息',
  system_prompt_tokens: '系统提示',
  ontology_context_tokens: '本体上下文',
  tool_definitions_tokens: '工具定义',
  checkpointer_history_tokens: '检查点历史',
};

interface ModelSpanRow {
  spanId: string;
  name: string;
  durationMs: number;
  usage: ModelUsage | null;
  /** true = 数据来自 estimated_input_tokens 兜底，output 不可靠 */
  estimated: boolean;
}

/** 从 output.content 中的 usage_metadata 正则提取 token */
const USAGE_META_RE =
  /usage_metadata=\{['"]input_tokens['"]: (\d+),\s*['"]output_tokens['"]: (\d+),\s*['"]total_tokens['"]: (\d+)/;

/** 从 output.content 中的 token_usage 正则提取 token（response_metadata 格式） */
const TOKEN_USAGE_RE =
  /token_usage['"]: \{['"]completion_tokens['"]: (\d+),\s*['"]prompt_tokens['"]: (\d+),\s*['"]total_tokens['"]: (\d+)/;

function extractModelUsage(
  attrs: Record<string, unknown>,
): { usage: ModelUsage | null; estimated: boolean } {
  // 路径1: 结构化 attributes.usage（DAG 路由）
  if (attrs.usage && typeof attrs.usage === 'object') {
    return { usage: attrs.usage as ModelUsage, estimated: false };
  }

  // 路径2: 从 output.content 字符串中正则提取
  const output = attrs.output as Record<string, unknown> | undefined;
  if (output && typeof output === 'object' && typeof output.content === 'string') {
    const m = output.content.match(USAGE_META_RE);
    if (m) {
      return {
        usage: { input_tokens: +m[1], output_tokens: +m[2], total_tokens: +m[3] },
        estimated: false,
      };
    }
    // 备选: response_metadata.token_usage 格式
    const m2 = output.content.match(TOKEN_USAGE_RE);
    if (m2) {
      return {
        usage: { input_tokens: +m2[2], output_tokens: +m2[1], total_tokens: +m2[3] },
        estimated: false,
      };
    }
  }

  // 路径3: estimated_input_tokens 兜底（仅当 input 不是 messages 数组时）
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

const ROLE_LABELS: Record<string, string> = {
  human: '用户消息',
  ai: 'AI 回复',
  tool: '工具输出',
  system: '系统提示',
};
const ROLE_COLORS: Record<string, string> = {
  human: '#3b82f6',
  ai: '#6366f1',
  tool: '#f59e0b',
  system: '#10b981',
};

/** 粗估字符串的 token 数（中英混合约 1 char ≈ 0.6 token，偏保守） */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.6);
}

interface PieSlice { name: string; value: number; color: string }

/** 为某个 model span 构建饼图数据 */
function buildModelPieData(attrs: Record<string, unknown>): PieSlice[] | null {
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
    // 加上 output tokens
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

export default function TraceModal({
  traceId,
  onClose,
  sessionTraceIds = [],
  budgetWarningThreshold = 80,
}: Props) {
  const [data, setData] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [flashedId, setFlashedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; ms: number } | null>(null);
  /** 饼图 Tab：'budget' = context_budget 全局视图，'model:<spanId>' = 某个 model span */
  const [pieTab, setPieTab] = useState<string>('budget');
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const ganttRef = useRef<HTMLDivElement>(null);

  const TREE_COL_W = 360;
  const HEADER_H = 34;

  const onGanttMouseMove = (e: React.MouseEvent) => {
    const gantt = ganttRef.current;
    if (!gantt || totalMs <= 0) return;
    const rect = gantt.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < TREE_COL_W || x > rect.width || y < HEADER_H) {
      setHover(null);
      return;
    }
    const barW = rect.width - TREE_COL_W;
    const pct = (x - TREE_COL_W) / barW;
    setHover({ x, ms: pct * totalMs });
  };

  const onGanttMouseLeave = () => setHover(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedSpanId) setSelectedSpanId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedSpanId, onClose]);

  useEffect(() => {
    setLoading(true);
    getTrace(traceId)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : '查询失败'))
      .finally(() => setLoading(false));
  }, [traceId]);

  const tree = useMemo(() => (data ? buildTree(data.spans) : []), [data]);
  const flatNodes = useMemo(() => flatten(tree, collapsed), [tree, collapsed]);

  const typeCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    return data.spans.reduce<Record<string, number>>((acc, s) => {
      acc[s.span_type] = (acc[s.span_type] || 0) + 1;
      return acc;
    }, {});
  }, [data]);

  const totalMs = data?.duration_ms ?? 0;
  const traceStartMs = data ? new Date(data.started_at).getTime() : 0;
  const { ticks } = useMemo(() => calcTicks(totalMs), [totalMs]);

  const topSpans = useMemo(() => {
    if (!data) return [];
    return [...data.spans]
      .sort((a, b) => b.duration_ms - a.duration_ms)
      .slice(0, 5);
  }, [data]);

  // ---- Token 分析数据 ----
  const contextBudgets = useMemo(() => {
    if (!data) return [];
    return data.spans
      .filter(s => s.span_type === 'context_budget')
      .map(s => ({ name: s.name, budget: s.attributes as unknown as ContextBudget }));
  }, [data]);

  const modelSpanRows = useMemo<ModelSpanRow[]>(() => {
    if (!data) return [];
    return data.spans
      .filter(s => s.span_type === 'model')
      .map(s => {
        const { usage, estimated } = extractModelUsage(s.attributes);
        return {
          spanId: s.span_id,
          name: s.name,
          durationMs: s.duration_ms,
          usage,
          estimated,
        };
      });
  }, [data]);

  /** 是否所有行都有精确（非估算）token 数据 */
  const allModelTokensExact = useMemo(
    () => modelSpanRows.length > 0 && modelSpanRows.every(r => r.usage && !r.estimated),
    [modelSpanRows],
  );

  const modelTotals = useMemo(() => {
    if (!allModelTokensExact) return null;
    return modelSpanRows.reduce(
      (acc, r) => ({
        input: acc.input + (r.usage?.input_tokens ?? 0),
        output: acc.output + (r.usage?.output_tokens ?? 0),
        total: acc.total + (r.usage?.total_tokens ?? 0),
      }),
      { input: 0, output: 0, total: 0 },
    );
  }, [modelSpanRows, allModelTokensExact]);

  // 趋势图数据
  const [trendData, setTrendData] = useState<
    { time: string; peakPrompt: number; budgetPct: number }[]
  >([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    const ids = sessionTraceIds.filter(Boolean);
    if (ids.length < 2) {
      setTrendData([]);
      return;
    }
    let cancelled = false;
    setTrendLoading(true);
    Promise.all(ids.map(id => getTrace(id).catch(() => null)))
      .then(results => {
        if (cancelled) return;
        const points = results
          .filter((r): r is TraceResponse => r !== null && !!r.token_summary)
          .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
          .map(r => ({
            time: new Date(r.started_at).toLocaleString('zh-CN', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            }),
            peakPrompt: r.token_summary!.peak_prompt_tokens,
            budgetPct: r.token_summary!.context_budget?.budget_usage_pct ?? 0,
          }));
        setTrendData(points);
      })
      .finally(() => !cancelled && setTrendLoading(false));
    return () => { cancelled = true; };
  }, [sessionTraceIds]);

  const parentMap = useMemo(() => {
    const m = new Map<string, string | null>();
    if (data) for (const s of data.spans) m.set(s.span_id, s.parent_span_id);
    return m;
  }, [data]);

  const locateSpan = (spanId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      let cur = parentMap.get(spanId) ?? null;
      while (cur) {
        next.delete(cur);
        cur = parentMap.get(cur) ?? null;
      }
      return next;
    });
    setFlashedId(spanId);
  };

  useEffect(() => {
    if (!flashedId) return;
    const raf = requestAnimationFrame(() => {
      const el = rowRefs.current.get(flashedId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const t = setTimeout(() => setFlashedId(null), 1600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [flashedId]);

  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDetail = (id: string) => {
    setSelectedSpanId(prev => (prev === id ? null : id));
  };

  const selectedSpan = useMemo(() => {
    if (!selectedSpanId || !data) return null;
    return data.spans.find(s => s.span_id === selectedSpanId) ?? null;
  }, [selectedSpanId, data]);

  const renderTreeRow = (node: FlatNode) => {
    const { span, depth, hasChildren, isCollapsed, ancestorsLast } = node;
    const color = SPAN_TYPE_COLORS[span.span_type] || '#94a3b8';
    const matchesFilter = typeFilter === 'all' || span.span_type === typeFilter;

    const indents = [];
    for (let i = 0; i < depth; i++) {
      const hasLine = !ancestorsLast[i];
      indents.push(
        <div
          key={i}
          className={`tree-indent ${hasLine ? 'has-line' : ''}`}
        />
      );
    }

    return (
      <div
        className="gantt-row-tree"
        onClick={() => toggleDetail(span.span_id)}
        style={{ opacity: matchesFilter ? 1 : 0.35 }}
      >
        {indents}
        <span
          className={`tree-chevron ${!hasChildren ? 'is-hidden' : ''} ${
            hasChildren && !isCollapsed ? 'is-open' : ''
          }`}
          onClick={e => {
            e.stopPropagation();
            if (hasChildren) toggleCollapsed(span.span_id);
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </span>
        <span className="tree-node-type" style={{ background: color }} />
        <span className="tree-node-name" title={`${span.span_type} · ${span.name}`}>
          {span.name}
        </span>
        <span className="tree-node-duration">{span.duration_ms.toFixed(1)}ms</span>
        <span className={`tree-node-status ${span.status}`} title={span.status} />
      </div>
    );
  };

  const renderBarCell = (node: FlatNode) => {
    const { span } = node;
    const { leftPct, widthPct } = positionSpan(span, traceStartMs, totalMs);
    const color = SPAN_TYPE_COLORS[span.span_type] || '#94a3b8';
    const matchesFilter = typeFilter === 'all' || span.span_type === typeFilter;

    return (
      <div className="gantt-row-bar">
        <div className="gantt-bar-grid">
          {ticks.map((t, i) => (
            <div
              key={i}
              className="grid-line"
              style={{ left: `${(t / totalMs) * 100}%` }}
            />
          ))}
        </div>
        <div
          className="gantt-bar"
          onClick={() => toggleDetail(span.span_id)}
          title={`${span.name} · ${span.duration_ms.toFixed(1)}ms`}
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            background: color,
            opacity: matchesFilter ? 1 : 0.25,
          }}
        />
      </div>
    );
  };


  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content trace-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>耗时分析详情</h2>
            {data && <div className="modal-subtitle">Trace · {data.agent_name}</div>}
          </div>
          <button className="icon-btn modal-close" onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {loading && (
            <div className="modal-loading">
              <div className="spinner" />
              <span>加载中...</span>
            </div>
          )}
          {error && <div className="modal-error">⚠️ {error}</div>}
          {data && (
            <>
              <div className="trace-summary">
                <div className="summary-item">
                  <div className="summary-label">总耗时</div>
                  <div className="summary-value summary-value-lg">
                    {(data.duration_ms / 1000).toFixed(2)}<span className="summary-unit">s</span>
                  </div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">模型调用</div>
                  <div className="summary-value">{data.model_call_count}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">工具调用</div>
                  <div className="summary-value">{data.tool_call_count}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Spans</div>
                  <div className="summary-value">{data.spans.length}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">状态</div>
                  <div className={`summary-value status-${data.status}`}>
                    {data.status === 'success' ? '✓ ' : ''}
                    {data.status}
                  </div>
                </div>
                {data.token_summary && (
                  <>
                    <div className="summary-item">
                      <div className="summary-label">Peak Prompt</div>
                      <div className="summary-value">
                        {data.token_summary.peak_prompt_tokens.toLocaleString()}
                      </div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Total Tokens</div>
                      <div className="summary-value">
                        {(data.token_summary.total_prompt_tokens + data.token_summary.total_completion_tokens).toLocaleString()}
                      </div>
                    </div>
                    {data.token_summary.context_budget && (
                      <div className="summary-item">
                        <div className="summary-label">Budget 使用率</div>
                        <div className={`summary-value ${
                          data.token_summary.context_budget.budget_usage_pct >= budgetWarningThreshold
                            ? 'token-danger' : ''
                        }`}>
                          {data.token_summary.context_budget.budget_usage_pct.toFixed(1)}
                          <span className="summary-unit">%</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="trace-meta">
                <div><span>Trace ID</span><code>{data.trace_id}</code></div>
                <div><span>Session</span><code>{data.session_id}</code></div>
                <div><span>起止</span>{new Date(data.started_at).toLocaleTimeString()} → {new Date(data.finished_at).toLocaleTimeString()}</div>
              </div>

              <div className="trace-toolbar">
                <div className="chip-group">
                  <button
                    className={`chip ${typeFilter === 'all' ? 'is-active' : ''}`}
                    onClick={() => setTypeFilter('all')}
                  >
                    全部 <span className="chip-count">{data.spans.length}</span>
                  </button>
                  {Object.entries(typeCounts).map(([type, count]) => (
                    <button
                      key={type}
                      className={`chip ${typeFilter === type ? 'is-active' : ''}`}
                      onClick={() => setTypeFilter(type)}
                    >
                      <span className="chip-dot" style={{ background: SPAN_TYPE_COLORS[type] || '#94a3b8' }} />
                      {type} <span className="chip-count">{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {topSpans.length > 0 && (
                <div className="trace-top-list">
                  <span className="trace-top-label">耗时 Top 5</span>
                  {topSpans.map((s, i) => (
                    <button
                      key={s.span_id}
                      className="trace-top-item"
                      onClick={() => locateSpan(s.span_id)}
                      title={`${s.name} · ${s.duration_ms.toFixed(1)}ms`}
                    >
                      <span className="trace-top-rank">#{i + 1}</span>
                      <span
                        className="trace-top-dot"
                        style={{
                          background: SPAN_TYPE_COLORS[s.span_type] || '#94a3b8',
                        }}
                      />
                      <span className="trace-top-name">{s.name}</span>
                      <span className="trace-top-time">
                        {s.duration_ms.toFixed(0)}ms
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* ---- Token 分析区块 ---- */}
              {(contextBudgets.length > 0 || modelSpanRows.length > 0) && (
                <div className="token-analysis-section">
                  <div className="token-section-title">Token 消耗分析</div>
                  <div className="token-analysis-body">
                    {/* 饼图区域：Tab 切换 Context Budget / Model Span */}
                    {(contextBudgets.length > 0 || modelSpanRows.length > 0) && (
                      <div className="token-pie-area">
                        {/* Tab 栏 */}
                        <div className="pie-tab-bar">
                          {contextBudgets.length > 0 && (
                            <button
                              className={`pie-tab ${pieTab === 'budget' ? 'is-active' : ''}`}
                              onClick={() => setPieTab('budget')}
                            >
                              Context Budget
                            </button>
                          )}
                          {modelSpanRows.map((r, i) => (
                            <button
                              key={r.spanId}
                              className={`pie-tab ${pieTab === `model:${r.spanId}` ? 'is-active' : ''}`}
                              onClick={() => setPieTab(`model:${r.spanId}`)}
                            >
                              {r.name}{modelSpanRows.length > 1 ? ` #${i + 1}` : ''}
                            </button>
                          ))}
                        </div>

                        {/* Context Budget 饼图 */}
                        {pieTab === 'budget' && contextBudgets.map((cb, idx) => {
                          const b = cb.budget;
                          const remaining = Math.max(0, b.model_context_limit - b.total_inject_tokens);
                          const slices = Object.entries(b)
                            .filter(([k, v]) => !BUDGET_SKIP_KEYS.has(k) && typeof v === 'number' && v > 0)
                            .map(([k, v]) => ({
                              name: BUDGET_KEY_LABELS[k] || k.replace(/_tokens$/, '').replace(/_/g, ' '),
                              value: v as number,
                            }));
                          const pieData = [...slices, { name: '剩余额度', value: remaining }];
                          return (
                            <div key={idx} className="budget-pie-card">
                              <div className="budget-pie-header">
                                <span className="budget-pie-name">{cb.name}</span>
                                {b.route_type && <span className="budget-pie-route">{b.route_type as string}</span>}
                                <span className={`budget-pie-pct ${
                                  b.budget_usage_pct >= budgetWarningThreshold ? 'token-danger' : ''
                                }`}>
                                  {b.budget_usage_pct.toFixed(1)}%
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                  <Pie
                                    data={pieData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={75}
                                    paddingAngle={2}
                                    label={({ percent }: { percent?: number }) => {
                                      const p = (percent ?? 0) * 100;
                                      return p >= 5 ? `${p.toFixed(1)}%` : '';
                                    }}
                                    labelLine={false}
                                  >
                                    {pieData.map((entry, i) => (
                                      <Cell
                                        key={i}
                                        fill={
                                          entry.name === '剩余额度'
                                            ? BUDGET_REMAINING_COLOR
                                            : BUDGET_PIE_COLORS[i % BUDGET_PIE_COLORS.length]
                                        }
                                      />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(value: unknown) => `${Number(value).toLocaleString()} tokens`} />
                                  <Legend
                                    formatter={(value: string) => {
                                      const item = pieData.find(d => d.name === value);
                                      return item ? `${value} · ${(item.value ?? 0).toLocaleString()} tokens` : value;
                                    }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                              <div className="budget-pie-detail">
                                上下文上限 {b.model_context_limit.toLocaleString()} · 已注入 {b.total_inject_tokens.toLocaleString()}
                                {b.note && <span className="budget-pie-note">{b.note as string}</span>}
                              </div>
                            </div>
                          );
                        })}

                        {/* Model Span 饼图 */}
                        {pieTab.startsWith('model:') && (() => {
                          const spanId = pieTab.slice(6);
                          const span = data?.spans.find(s => s.span_id === spanId);
                          if (!span) return <div className="pie-empty">未找到该 Model Span</div>;
                          const modelPie = buildModelPieData(span.attributes);
                          if (!modelPie) return <div className="pie-empty">该 Model Span 无可用 token 分布数据</div>;
                          const isMessages = Array.isArray(span.attributes.input);
                          return (
                            <div className="budget-pie-card">
                              <div className="budget-pie-header">
                                <span className="budget-pie-name">{span.name}</span>
                                <span className="budget-pie-route">
                                  {isMessages ? '按消息角色估算' : 'Input vs Output'}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                  <Pie
                                    data={modelPie}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={75}
                                    paddingAngle={2}
                                    label={({ percent }: { percent?: number }) => {
                                      const p = (percent ?? 0) * 100;
                                      return p >= 5 ? `${p.toFixed(1)}%` : '';
                                    }}
                                    labelLine={false}
                                  >
                                    {modelPie.map((entry, i) => (
                                      <Cell key={i} fill={entry.color || BUDGET_PIE_COLORS[i % BUDGET_PIE_COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(value: unknown) => `~${Number(value).toLocaleString()} tokens`} />
                                  <Legend
                                    formatter={(value: string) => {
                                      const item = modelPie.find(d => d.name === value);
                                      return item ? `${value} · ~${(item.value ?? 0).toLocaleString()} tokens` : value;
                                    }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                              {isMessages && (
                                <div className="budget-pie-detail">
                                  Token 数为字符数估算（~0.6 token/字符），仅供参考
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Model Span Token 汇总表 */}
                    {modelSpanRows.length > 0 && (
                      <div className="model-token-table-wrap">
                        <table className="model-token-table">
                          <thead>
                            <tr>
                              <th>模型</th>
                              <th>Input Tokens</th>
                              <th>Output Tokens</th>
                              <th>Total</th>
                              <th>耗时</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modelSpanRows.map((r, i) => {
                              const u = r.usage;
                              const prefix = r.estimated ? '~' : '';
                              return (
                                <tr
                                  key={r.spanId}
                                  className="model-token-row"
                                  onClick={() => { setPieTab(`model:${r.spanId}`); toggleDetail(r.spanId); }}
                                >
                                  <td>
                                    <span className="model-token-name">{r.name}</span>
                                    {modelSpanRows.length > 1 && (
                                      <span className="model-token-idx">#{i + 1}</span>
                                    )}
                                  </td>
                                  <td>{u ? `${prefix}${u.input_tokens.toLocaleString()}` : '—'}</td>
                                  <td>{u && !r.estimated ? u.output_tokens.toLocaleString() : '—'}</td>
                                  <td>{u && !r.estimated ? u.total_tokens.toLocaleString() : '—'}</td>
                                  <td>{r.durationMs >= 1000
                                    ? (r.durationMs / 1000).toFixed(1) + 's'
                                    : r.durationMs.toFixed(0) + 'ms'
                                  }</td>
                                </tr>
                              );
                            })}
                            {modelSpanRows.length > 1 && (
                              <tr className="model-token-total">
                                <td>合计</td>
                                {modelTotals ? (
                                  <>
                                    <td>{modelTotals.input.toLocaleString()}</td>
                                    <td>{modelTotals.output.toLocaleString()}</td>
                                    <td>{modelTotals.total.toLocaleString()}</td>
                                  </>
                                ) : (
                                  <>
                                    <td>—</td><td>—</td><td>—</td>
                                  </>
                                )}
                                <td>—</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ---- Token 趋势图 ---- */}
              {trendData.length >= 2 && (
                <div className="token-trend-section">
                  <div className="token-section-title">Token 趋势（Session 内）</div>
                  {trendLoading ? (
                    <div className="modal-loading"><div className="spinner" /><span>加载趋势数据...</span></div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="var(--text-subtle)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--text-subtle)" />
                        <ReTooltip
                          contentStyle={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="peakPrompt"
                          name="Peak Prompt Tokens"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={(props: Record<string, unknown>) => {
                            const cx = (props.cx as number) ?? 0;
                            const cy = (props.cy as number) ?? 0;
                            const pl = props.payload as { budgetPct?: number } | undefined;
                            const pct = pl?.budgetPct ?? 0;
                            return (
                              <circle
                                key={`dot-${cx}-${cy}`}
                                cx={cx}
                                cy={cy}
                                r={4}
                                fill={pct >= budgetWarningThreshold ? '#ef4444' : '#6366f1'}
                                stroke="white"
                                strokeWidth={1.5}
                              />
                            );
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              <div
                className="trace-gantt"
                ref={ganttRef}
                onMouseMove={onGanttMouseMove}
                onMouseLeave={onGanttMouseLeave}
              >
                <div className="gantt-header">
                  <div className="gantt-header-tree">名称</div>
                  <div className="gantt-header-axis">
                    {ticks.map((t, i) => (
                      <div
                        key={i}
                        className="gantt-tick"
                        style={{ left: `${(t / totalMs) * 100}%` }}
                      >
                        {formatTickLabel(Math.round(t))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="gantt-body">
                  {flatNodes.map(node => {
                    const id = node.span.span_id;
                    const isSelected = selectedSpanId === id;
                    const isFlashed = flashedId === id;
                    return (
                      <div
                        key={id}
                        ref={el => {
                          if (el) rowRefs.current.set(id, el);
                          else rowRefs.current.delete(id);
                        }}
                        className={`gantt-row ${isSelected ? 'is-expanded' : ''} ${
                          isFlashed ? 'is-flashed' : ''
                        }`}
                      >
                        {renderTreeRow(node)}
                        {renderBarCell(node)}
                      </div>
                    );
                  })}
                </div>
                {hover && (
                  <div className="gantt-hover-line" style={{ left: hover.x }}>
                    <div className="gantt-hover-label">
                      {formatTickLabel(Math.round(hover.ms))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {selectedSpan && (
          <>
            <div
              className="span-drawer-backdrop"
              onClick={() => setSelectedSpanId(null)}
            />
            <aside className="span-drawer" role="dialog" aria-modal="true">
              <div className="span-drawer-header">
                <div className="span-drawer-title">
                  <span
                    className="span-drawer-type"
                    style={{
                      background:
                        SPAN_TYPE_COLORS[selectedSpan.span_type] || '#94a3b8',
                    }}
                  >
                    {selectedSpan.span_type}
                  </span>
                  <span className="span-drawer-name" title={selectedSpan.name}>
                    {selectedSpan.name}
                  </span>
                </div>
                <button
                  className="icon-btn modal-close"
                  onClick={() => setSelectedSpanId(null)}
                  aria-label="关闭"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="span-drawer-body">
                <div className="gantt-detail-grid">
                  <div className="gantt-detail-row-item">
                    <span className="gantt-detail-label">Span ID</span>
                    <code className="gantt-detail-value">{selectedSpan.span_id}</code>
                  </div>
                  <div className="gantt-detail-row-item">
                    <span className="gantt-detail-label">耗时</span>
                    <span className="gantt-detail-value">
                      {selectedSpan.duration_ms.toFixed(1)} ms
                    </span>
                  </div>
                  <div className="gantt-detail-row-item">
                    <span className="gantt-detail-label">状态</span>
                    <span
                      className={`gantt-detail-value ${
                        selectedSpan.status === 'error' ||
                        selectedSpan.status === 'failed'
                          ? 'error'
                          : ''
                      }`}
                    >
                      {selectedSpan.status}
                    </span>
                  </div>
                  <div className="gantt-detail-row-item">
                    <span className="gantt-detail-label">开始</span>
                    <span className="gantt-detail-value">
                      {new Date(selectedSpan.started_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="gantt-detail-row-item">
                    <span className="gantt-detail-label">结束</span>
                    <span className="gantt-detail-value">
                      {new Date(selectedSpan.finished_at).toLocaleString()}
                    </span>
                  </div>
                  {selectedSpan.error && (
                    <div className="gantt-detail-row-item">
                      <span className="gantt-detail-label">错误</span>
                      <span className="gantt-detail-value error">
                        {selectedSpan.error}
                      </span>
                    </div>
                  )}
                </div>
                {/* Model span Token 详情 */}
                {selectedSpan.span_type === 'model' && (() => {
                  const { usage: du, estimated: de } = extractModelUsage(selectedSpan.attributes);
                  if (!du) return null;
                  const pre = de ? '~' : '';
                  return (
                    <>
                      <div className="span-drawer-section-title">
                        Token 消耗{de ? '（估算）' : ''}
                      </div>
                      <div className="gantt-detail-grid">
                        <div className="gantt-detail-row-item">
                          <span className="gantt-detail-label">Input Tokens</span>
                          <span className="gantt-detail-value">{pre}{du.input_tokens.toLocaleString()}</span>
                        </div>
                        <div className="gantt-detail-row-item">
                          <span className="gantt-detail-label">Output Tokens</span>
                          <span className="gantt-detail-value">{de ? '—' : du.output_tokens.toLocaleString()}</span>
                        </div>
                        <div className="gantt-detail-row-item">
                          <span className="gantt-detail-label">Total Tokens</span>
                          <span className="gantt-detail-value">{de ? '—' : du.total_tokens.toLocaleString()}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
                <div className="span-drawer-section-title">属性 (attributes)</div>
                <pre className="span-drawer-pre">
                  {JSON.stringify(selectedSpan.attributes, null, 2)}
                </pre>
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
