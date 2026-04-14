import type { TraceSpan } from '../../types/api';
import { SPAN_TYPE_COLORS } from '../../utils/traceModel';

interface Props {
  topSpans: TraceSpan[];
  onLocate: (spanId: string) => void;
}

export default function TraceTopSpans({ topSpans, onLocate }: Props) {
  if (topSpans.length === 0) return null;

  return (
    <div className="trace-top-list">
      <span className="trace-top-label">耗时 Top 5</span>
      {topSpans.map((s, i) => (
        <button
          key={s.span_id}
          className="trace-top-item"
          onClick={() => onLocate(s.span_id)}
          title={`${s.name} · ${s.duration_ms.toFixed(1)}ms`}
        >
          <span className="trace-top-rank">#{i + 1}</span>
          <span
            className="trace-top-dot"
            style={{ background: SPAN_TYPE_COLORS[s.span_type] || '#94a3b8' }}
          />
          <span className="trace-top-name">{s.name}</span>
          <span className="trace-top-time">{s.duration_ms.toFixed(0)}ms</span>
        </button>
      ))}
    </div>
  );
}
