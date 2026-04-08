import { useEffect, useMemo, useState } from 'react';
import type { TraceResponse, TraceSpan } from '../types/api';
import { getTrace } from '../services/api';

interface Props {
  traceId: string;
  onClose: () => void;
}

const SPAN_TYPE_COLORS: Record<string, string> = {
  agent: '#6366f1',
  model: '#10b981',
  tool: '#f59e0b',
};

type SortMode = 'sequence' | 'duration';

export default function TraceModal({ traceId, onClose }: Props) {
  const [data, setData] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('sequence');

  useEffect(() => {
    setLoading(true);
    getTrace(traceId)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : '查询失败'))
      .finally(() => setLoading(false));
  }, [traceId]);

  const typeCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    return data.spans.reduce<Record<string, number>>((acc, s) => {
      acc[s.span_type] = (acc[s.span_type] || 0) + 1;
      return acc;
    }, {});
  }, [data]);

  const visibleSpans = useMemo(() => {
    if (!data) return [];
    let list = [...data.spans];
    if (typeFilter !== 'all') list = list.filter(s => s.span_type === typeFilter);
    if (sortMode === 'duration') list.sort((a, b) => b.duration_ms - a.duration_ms);
    return list;
  }, [data, typeFilter, sortMode]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalMs = data?.duration_ms || 0;

  const renderSpan = (span: TraceSpan, idx: number) => {
    const isExpanded = expanded.has(span.span_id);
    const startOffset = data
      ? new Date(span.started_at).getTime() - new Date(data.started_at).getTime()
      : 0;
    const widthPct = totalMs > 0 ? (span.duration_ms / totalMs) * 100 : 0;
    const offsetPct = totalMs > 0 ? (startOffset / totalMs) * 100 : 0;
    const color = SPAN_TYPE_COLORS[span.span_type] || '#94a3b8';

    return (
      <div key={span.span_id} className={`span-item ${isExpanded ? 'is-expanded' : ''}`}>
        <div className="span-header" onClick={() => toggleExpand(span.span_id)}>
          <span className="span-index">#{idx + 1}</span>
          <span className="span-type-badge" style={{ background: color }}>
            {span.span_type}
          </span>
          <span className="span-name" title={span.name}>{span.name}</span>
          <span className="span-duration">{span.duration_ms.toFixed(1)} ms</span>
          <span className={`span-status span-status-${span.status}`}>{span.status}</span>
          <span className={`span-toggle ${isExpanded ? 'is-open' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
        <div className="span-bar-track" title={`${span.duration_ms.toFixed(1)} ms`}>
          <div
            className="span-bar"
            style={{
              left: `${offsetPct}%`,
              width: `${Math.max(widthPct, 0.3)}%`,
              background: color,
            }}
          />
        </div>
        {isExpanded && (
          <div className="span-details">
            <div className="span-detail-grid">
              <div className="span-detail-row">
                <span className="span-detail-label">Span ID</span>
                <code className="span-detail-value">{span.span_id}</code>
              </div>
              <div className="span-detail-row">
                <span className="span-detail-label">开始时间</span>
                <span className="span-detail-value">{new Date(span.started_at).toLocaleString()}</span>
              </div>
              <div className="span-detail-row">
                <span className="span-detail-label">结束时间</span>
                <span className="span-detail-value">{new Date(span.finished_at).toLocaleString()}</span>
              </div>
              {span.error && (
                <div className="span-detail-row">
                  <span className="span-detail-label">错误</span>
                  <span className="span-detail-value error">{span.error}</span>
                </div>
              )}
            </div>
            <details className="span-attributes" open>
              <summary>属性 (attributes)</summary>
              <pre>{JSON.stringify(span.attributes, null, 2)}</pre>
            </details>
          </div>
        )}
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
                <div className="sort-group">
                  <button
                    className={`chip ${sortMode === 'sequence' ? 'is-active' : ''}`}
                    onClick={() => setSortMode('sequence')}
                  >按顺序</button>
                  <button
                    className={`chip ${sortMode === 'duration' ? 'is-active' : ''}`}
                    onClick={() => setSortMode('duration')}
                  >按耗时</button>
                </div>
              </div>

              <div className="spans-list">
                {visibleSpans.map(renderSpan)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
