import type { TraceSpan } from '../../types/api';
import { SPAN_TYPE_COLORS, extractModelUsage } from '../../utils/traceModel';

interface Props {
  span: TraceSpan;
  onClose: () => void;
}

export default function SpanDrawer({ span, onClose }: Props) {
  return (
    <>
      <div className="span-drawer-backdrop" onClick={onClose} />
      <aside
        className="span-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="span-drawer-title"
      >
        <div className="span-drawer-header">
          <div className="span-drawer-title">
            <span
              className="span-drawer-type"
              style={{ background: SPAN_TYPE_COLORS[span.span_type] || '#94a3b8' }}
            >
              {span.span_type}
            </span>
            <span id="span-drawer-title" className="span-drawer-name" title={span.name}>
              {span.name}
            </span>
          </div>
          <button
            className="icon-btn modal-close"
            onClick={onClose}
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
              <code className="gantt-detail-value">{span.span_id}</code>
            </div>
            <div className="gantt-detail-row-item">
              <span className="gantt-detail-label">耗时</span>
              <span className="gantt-detail-value">{span.duration_ms.toFixed(1)} ms</span>
            </div>
            <div className="gantt-detail-row-item">
              <span className="gantt-detail-label">状态</span>
              <span className={`gantt-detail-value ${
                span.status === 'error' || span.status === 'failed' ? 'error' : ''
              }`}>
                {span.status}
              </span>
            </div>
            <div className="gantt-detail-row-item">
              <span className="gantt-detail-label">开始</span>
              <span className="gantt-detail-value">{new Date(span.started_at).toLocaleString()}</span>
            </div>
            <div className="gantt-detail-row-item">
              <span className="gantt-detail-label">结束</span>
              <span className="gantt-detail-value">{new Date(span.finished_at).toLocaleString()}</span>
            </div>
            {span.error && (
              <div className="gantt-detail-row-item">
                <span className="gantt-detail-label">错误</span>
                <span className="gantt-detail-value error">{span.error}</span>
              </div>
            )}
          </div>
          {span.span_type === 'model' && (() => {
            const { usage: du, estimated: de } = extractModelUsage(span.attributes);
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
            {JSON.stringify(span.attributes, null, 2)}
          </pre>
        </div>
      </aside>
    </>
  );
}
