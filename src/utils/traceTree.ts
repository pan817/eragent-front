import type { TraceSpan } from '../types/api';

export interface SpanNode extends TraceSpan {
  children: SpanNode[];
}

export function buildTree(spans: TraceSpan[]): SpanNode[] {
  const map = new Map<string, SpanNode>();
  for (const s of spans) {
    map.set(s.span_id, { ...s, children: [] });
  }
  const roots: SpanNode[] = [];
  for (const node of map.values()) {
    if (node.parent_span_id && map.has(node.parent_span_id)) {
      map.get(node.parent_span_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: SpanNode[]) => {
    nodes.sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );
    nodes.forEach(n => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export interface FlatNode {
  span: SpanNode;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  ancestorsLast: boolean[];
}

export function flatten(roots: SpanNode[], collapsed: Set<string>): FlatNode[] {
  const out: FlatNode[] = [];
  const visit = (nodes: SpanNode[], depth: number, ancestorsLast: boolean[]) => {
    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1;
      const isCollapsed = collapsed.has(node.span_id);
      out.push({
        span: node,
        depth,
        hasChildren: node.children.length > 0,
        isCollapsed,
        ancestorsLast: [...ancestorsLast, isLast],
      });
      if (!isCollapsed && node.children.length > 0) {
        visit(node.children, depth + 1, [...ancestorsLast, isLast]);
      }
    });
  };
  visit(roots, 0, []);
  return out;
}

export interface TickResult {
  step: number;
  ticks: number[];
}

export function calcTicks(totalMs: number, targetCount = 8): TickResult {
  if (totalMs <= 0) return { step: 0, ticks: [0] };
  const candidates = [
    1, 2, 5, 10, 20, 50, 100, 200, 500,
    1000, 2000, 5000, 10000, 20000, 50000, 100000,
  ];
  const target = totalMs / targetCount;
  const step = candidates.find(c => c >= target) ?? candidates[candidates.length - 1];
  const ticks: number[] = [];
  for (let t = 0; t <= totalMs + 0.001; t += step) {
    ticks.push(t);
  }
  return { step, ticks };
}

export function formatTickLabel(ms: number): string {
  if (ms === 0) return '0';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
}

export function positionSpan(
  span: TraceSpan,
  traceStartMs: number,
  totalMs: number
): { leftPct: number; widthPct: number } {
  if (totalMs <= 0) return { leftPct: 0, widthPct: 0 };
  const startOffset = new Date(span.started_at).getTime() - traceStartMs;
  const leftPct = Math.max(0, (startOffset / totalMs) * 100);
  const widthPct = Math.max(0.3, (span.duration_ms / totalMs) * 100);
  return { leftPct, widthPct };
}
