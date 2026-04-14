import { useState, useMemo } from 'react';
import type { TraceSpan, ContextBudget } from '../../types/api';
import {
  BUDGET_PIE_COLORS,
  BUDGET_REMAINING_COLOR,
  BUDGET_SKIP_KEYS,
  BUDGET_KEY_LABELS,
  buildModelPieData,
  extractModelUsage,
  type ModelSpanRow,
} from '../../utils/traceModel';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface BudgetEntry {
  name: string;
  budget: ContextBudget;
}

/**
 * 从 span.attributes (Record<string, unknown>) 收敛成 ContextBudget。
 * 校验必填字段都是数字；任一缺失返回 null，让调用方丢弃该 span。
 * 原先用 `as unknown as ContextBudget` 强转，后端字段名改动时前端只会在运行时读到 undefined
 * 并静默画空图，这里显式校验把失败前移到数据进入点。
 */
function toContextBudget(attrs: Record<string, unknown>): ContextBudget | null {
  const total = attrs.total_inject_tokens;
  const limit = attrs.model_context_limit;
  const pct = attrs.budget_usage_pct;
  if (typeof total !== 'number' || typeof limit !== 'number' || typeof pct !== 'number') {
    return null;
  }
  return attrs as unknown as ContextBudget;
}

interface Props {
  spans: TraceSpan[];
  budgetWarningThreshold: number;
  onSelectSpan?: (spanId: string) => void;
}

export default function TokenAnalysis({ spans, budgetWarningThreshold, onSelectSpan }: Props) {
  const contextBudgets = useMemo<BudgetEntry[]>(() => {
    const out: BudgetEntry[] = [];
    for (const s of spans) {
      if (s.span_type !== 'context_budget') continue;
      const budget = toContextBudget(s.attributes);
      // budget 为 null 说明 attributes 结构与契约不符（必填字段缺失），跳过避免后续渲染崩溃
      if (budget) out.push({ name: s.name, budget });
    }
    return out;
  }, [spans]);

  const modelSpanRows = useMemo<ModelSpanRow[]>(() =>
    spans
      .filter(s => s.span_type === 'model')
      .map(s => {
        const { usage, estimated } = extractModelUsage(s.attributes);
        return { spanId: s.span_id, name: s.name, durationMs: s.duration_ms, usage, estimated };
      }),
    [spans],
  );

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

  const [pieTab, setPieTab] = useState<string>('budget');

  if (contextBudgets.length === 0 && modelSpanRows.length === 0) return null;

  return (
    <div className="token-analysis-section">
      <div className="token-section-title">Token 消耗分析</div>
      <div className="token-analysis-body">
        {(contextBudgets.length > 0 || modelSpanRows.length > 0) && (
          <div className="token-pie-area">
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
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={75}
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
                            fill={entry.name === '剩余额度'
                              ? BUDGET_REMAINING_COLOR
                              : BUDGET_PIE_COLORS[i % BUDGET_PIE_COLORS.length]}
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

            {pieTab.startsWith('model:') && (() => {
              const spanId = pieTab.slice(6);
              const span = spans.find(s => s.span_id === spanId);
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
                        dataKey="value" nameKey="name"
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={75}
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
                      onClick={() => {
                        setPieTab(`model:${r.spanId}`);
                        onSelectSpan?.(r.spanId);
                      }}
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
                      <><td>—</td><td>—</td><td>—</td></>
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
  );
}
