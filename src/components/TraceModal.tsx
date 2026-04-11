import { useEffect, useMemo, useRef, useState } from 'react';
import type { TraceResponse } from '../types/api';
import { getTrace } from '../services/api';
import {
  buildTree,
  flatten,
  calcTicks,
  formatTickLabel,
  positionSpan,
  type FlatNode,
} from '../utils/traceTree';

interface Props {
  traceId: string;
  onClose: () => void;
}

const SPAN_TYPE_COLORS: Record<string, string> = {
  agent: '#6366f1',
  model: '#10b981',
  tool: '#f59e0b',
};

export default function TraceModal({ traceId, onClose }: Props) {
  const [data, setData] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [flashedId, setFlashedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; ms: number } | null>(null);
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
