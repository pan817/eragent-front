import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

export interface TrendPoint {
  time: string;
  peakPrompt: number;
  budgetPct: number;
}

interface Props {
  data: TrendPoint[];
  loading: boolean;
  budgetWarningThreshold: number;
  expanded?: boolean;
  onToggle?: () => void;
  totalIds?: number;
}

export default function TokenTrend({
  data,
  loading,
  budgetWarningThreshold,
  expanded,
  onToggle,
  totalIds,
}: Props) {
  const controllable = typeof onToggle === 'function';
  const isExpanded = controllable ? !!expanded : true;
  if (!controllable && data.length < 1) return null;
  if (controllable && !isExpanded && (totalIds ?? 0) < 1) return null;

  return (
    <div className="token-trend-section">
      <div className="token-section-title token-section-title--row">
        <span>Token 趋势（Session 内）</span>
        {controllable && (
          <button type="button" className="link-btn" onClick={onToggle}>
            {isExpanded ? '收起' : `展开查看${totalIds ? `（${totalIds} 条）` : ''}`}
          </button>
        )}
      </div>
      {!isExpanded ? null : loading ? (
        <div className="modal-loading"><div className="spinner" /><span>加载趋势数据...</span></div>
      ) : data.length < 1 ? (
        <div className="modal-empty">暂无趋势数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="var(--text-subtle)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-subtle)" />
            <Tooltip
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
  );
}
