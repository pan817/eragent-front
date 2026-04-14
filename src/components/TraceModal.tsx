import { useEffect, useMemo, useRef, useState } from 'react';
import type { TraceResponse } from '../types/api';
import { getTraceCached } from '../services/api';
import { useDrawerFocusRestore } from '../hooks/useDrawerFocusRestore';

const TREND_WINDOW = 20;
import { buildTree, flatten, calcTicks } from '../utils/traceTree';
import { SPAN_TYPE_COLORS } from '../utils/traceModel';
import TraceSummary from './trace/TraceSummary';
import TraceTopSpans from './trace/TraceTopSpans';
import TraceGantt from './trace/TraceGantt';
import TokenAnalysis from './trace/TokenAnalysis';
import TokenTrend, { type TrendPoint } from './trace/TokenTrend';
import SpanDrawer from './trace/SpanDrawer';
import { TraceSummarySkeleton, TraceTopSpansSkeleton } from './Skeleton';

interface Props {
  traceId: string;
  onClose: () => void;
  sessionTraceIds?: string[];
  budgetWarningThreshold?: number;
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
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const focusRestore = useDrawerFocusRestore(selectedSpanId, rowRefs);

  // ---- Keyboard ----
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

  // ---- Fetch trace ----
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTraceCached(traceId)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : '查询失败');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [traceId]);

  // ---- Derived data ----
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
      .sort((a, b) => {
        const d = b.duration_ms - a.duration_ms;
        return d !== 0 ? d : a.span_id.localeCompare(b.span_id);
      })
      .slice(0, 5);
  }, [data]);

  // ---- Trend data (lazy-loaded, cached, deduped, windowed) ----
  const [trendExpanded, setTrendExpanded] = useState(false);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const trendFetchIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const sliced = sessionTraceIds.slice(-TREND_WINDOW);
    for (const id of sliced) {
      if (!id || id === traceId || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }, [sessionTraceIds, traceId]);

  const trendFetchIdsKey = trendFetchIds.join(',');
  const trendTotalCount =
    trendFetchIds.length + (data?.token_summary ? 1 : 0);

  useEffect(() => {
    if (!trendExpanded) return;
    let cancelled = false;
    setTrendLoading(true);
    Promise.all(trendFetchIds.map(id => getTraceCached(id).catch(() => null)))
      .then(results => {
        if (cancelled) return;
        const all = results.filter((r): r is TraceResponse => r !== null);
        if (data) all.push(data);
        const points = all
          .filter(r => !!r.token_summary)
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
      .finally(() => { if (!cancelled) setTrendLoading(false); });
    return () => { cancelled = true; };
    // trendFetchIdsKey 替代 trendFetchIds 做稳定比较
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendExpanded, trendFetchIdsKey, data]);

  // ---- Parent map for locating spans ----
  const parentMap = useMemo(() => {
    const m = new Map<string, string | null>();
    if (data) for (const s of data.spans) m.set(s.span_id, s.parent_span_id);
    return m;
  }, [data]);

  const locateSpan = (spanId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      let cur = parentMap.get(spanId) ?? null;
      while (cur) { next.delete(cur); cur = parentMap.get(cur) ?? null; }
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
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [flashedId]);

  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleDetail = (id: string) => {
    setSelectedSpanId(prev => {
      if (prev === id) return null;
      focusRestore.capture(id);
      return id;
    });
  };

  const selectedSpan = useMemo(() => {
    if (!selectedSpanId || !data) return null;
    return data.spans.find(s => s.span_id === selectedSpanId) ?? null;
  }, [selectedSpanId, data]);

  // ---- Render ----
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
            <>
              <TraceSummarySkeleton />
              <TraceTopSpansSkeleton />
              <div className="sr-only" role="status" aria-live="polite">加载 Trace 数据中...</div>
            </>
          )}
          {error && <div className="modal-error">⚠️ {error}</div>}
          {data && (
            <>
              <TraceSummary data={data} budgetWarningThreshold={budgetWarningThreshold} />

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

              <TraceTopSpans topSpans={topSpans} onLocate={locateSpan} />

              <TokenAnalysis
                spans={data.spans}
                budgetWarningThreshold={budgetWarningThreshold}
                onSelectSpan={toggleDetail}
              />

              <TokenTrend
                data={trendData}
                loading={trendLoading}
                budgetWarningThreshold={budgetWarningThreshold}
                expanded={trendExpanded}
                onToggle={() => setTrendExpanded(v => !v)}
                totalIds={trendTotalCount}
              />

              <TraceGantt
                flatNodes={flatNodes}
                ticks={ticks}
                totalMs={totalMs}
                traceStartMs={traceStartMs}
                typeFilter={typeFilter}
                selectedSpanId={selectedSpanId}
                flashedId={flashedId}
                onToggleCollapsed={toggleCollapsed}
                onToggleDetail={toggleDetail}
                rowRefs={rowRefs}
              />
            </>
          )}
        </div>
        {selectedSpan && (
          <SpanDrawer span={selectedSpan} onClose={() => setSelectedSpanId(null)} />
        )}
      </div>
    </div>
  );
}
