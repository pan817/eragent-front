import './Skeleton.css';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  rounded?: boolean;
  className?: string;
}

export function Skeleton({ width, height, rounded, className = '' }: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;
  return (
    <span
      className={`skeleton ${rounded ? 'skeleton--round' : ''} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

interface SkeletonGridProps {
  cells?: number;
  /** Tailored to .trace-summary cell dims */
  cellHeight?: number;
}

export function TraceSummarySkeleton({ cells = 6, cellHeight = 64 }: SkeletonGridProps) {
  return (
    <div className="trace-summary" aria-hidden="true">
      {Array.from({ length: cells }).map((_, i) => (
        <div className="summary-item skeleton-cell" key={i}>
          <Skeleton width="50%" height={10} />
          <Skeleton width="70%" height={cellHeight === 64 ? 22 : cellHeight * 0.35} />
        </div>
      ))}
    </div>
  );
}

export function TraceTopSpansSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="trace-top-list skeleton-top-list" aria-hidden="true">
      <Skeleton width={56} height={12} />
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-top-item" key={i}>
          <Skeleton width={20} height={12} />
          <Skeleton width={12} height={12} rounded />
          <Skeleton width="60%" height={12} />
          <Skeleton width={48} height={12} />
        </div>
      ))}
    </div>
  );
}

export function ChartBlockSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="skeleton-chart" style={{ height }} aria-hidden="true">
      <div className="skeleton-chart-bars">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="skeleton-chart-bar" style={{ height: `${30 + ((i * 13) % 60)}%` }} />
        ))}
      </div>
    </div>
  );
}
