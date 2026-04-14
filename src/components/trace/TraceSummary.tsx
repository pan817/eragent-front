import type { TraceResponse } from '../../types/api';

interface Props {
  data: TraceResponse;
  budgetWarningThreshold: number;
}

export default function TraceSummary({ data, budgetWarningThreshold }: Props) {
  return (
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
    </>
  );
}
