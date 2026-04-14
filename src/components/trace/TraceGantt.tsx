import { useRef, useState } from 'react';
import { SPAN_TYPE_COLORS } from '../../utils/traceModel';
import { positionSpan, formatTickLabel } from '../../utils/traceTree';
import type { FlatNode } from '../../utils/traceTree';

interface Props {
  flatNodes: FlatNode[];
  ticks: number[];
  totalMs: number;
  traceStartMs: number;
  typeFilter: string;
  selectedSpanId: string | null;
  flashedId: string | null;
  onToggleCollapsed: (id: string) => void;
  onToggleDetail: (id: string) => void;
  rowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

const TREE_COL_W = 360;
const HEADER_H = 34;

export default function TraceGantt({
  flatNodes,
  ticks,
  totalMs,
  traceStartMs,
  typeFilter,
  selectedSpanId,
  flashedId,
  onToggleCollapsed,
  onToggleDetail,
  rowRefs,
}: Props) {
  const ganttRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; ms: number } | null>(null);

  const onMouseMove = (e: React.MouseEvent) => {
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

  const renderTreeRow = (node: FlatNode) => {
    const { span, depth, hasChildren, isCollapsed, ancestorsLast } = node;
    const color = SPAN_TYPE_COLORS[span.span_type] || '#94a3b8';
    const matchesFilter = typeFilter === 'all' || span.span_type === typeFilter;

    const indents = [];
    for (let i = 0; i < depth; i++) {
      const hasLine = !ancestorsLast[i];
      indents.push(
        <div key={i} className={`tree-indent ${hasLine ? 'has-line' : ''}`} />
      );
    }

    return (
      <div
        className="gantt-row-tree"
        onClick={() => onToggleDetail(span.span_id)}
        style={{ opacity: matchesFilter ? 1 : 0.35 }}
      >
        {indents}
        <span
          className={`tree-chevron ${!hasChildren ? 'is-hidden' : ''} ${
            hasChildren && !isCollapsed ? 'is-open' : ''
          }`}
          onClick={e => {
            e.stopPropagation();
            if (hasChildren) onToggleCollapsed(span.span_id);
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
            <div key={i} className="grid-line" style={{ left: `${(t / totalMs) * 100}%` }} />
          ))}
        </div>
        <div
          className="gantt-bar"
          onClick={() => onToggleDetail(span.span_id)}
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
    <div
      className="trace-gantt"
      ref={ganttRef}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      <div className="gantt-header">
        <div className="gantt-header-tree">名称</div>
        <div className="gantt-header-axis">
          {ticks.map((t, i) => (
            <div key={i} className="gantt-tick" style={{ left: `${(t / totalMs) * 100}%` }}>
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
              className={`gantt-row ${isSelected ? 'is-expanded' : ''} ${isFlashed ? 'is-flashed' : ''}`}
            >
              {renderTreeRow(node)}
              {renderBarCell(node)}
            </div>
          );
        })}
      </div>
      {hover && (
        <div className="gantt-hover-line" style={{ left: hover.x }}>
          <div className="gantt-hover-label">{formatTickLabel(Math.round(hover.ms))}</div>
        </div>
      )}
    </div>
  );
}
