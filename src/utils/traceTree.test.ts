import type { TraceSpan } from '../types/api'
import { buildTree, flatten, calcTicks, formatTickLabel, positionSpan } from './traceTree'

const makeSpan = (overrides: Partial<TraceSpan> & Pick<TraceSpan, 'span_id'>): TraceSpan => ({
  trace_id: 'trace-1',
  parent_span_id: null,
  span_type: 'task',
  name: 'test',
  status: 'completed',
  started_at: '2026-01-01T00:00:00Z',
  finished_at: '2026-01-01T00:00:01Z',
  duration_ms: 1000,
  attributes: {},
  error: null,
  ...overrides,
})

describe('buildTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([])
  })

  it('builds a flat list when no parent references', () => {
    const spans = [
      makeSpan({ span_id: 'a', started_at: '2026-01-01T00:00:02Z' }),
      makeSpan({ span_id: 'b', started_at: '2026-01-01T00:00:01Z' }),
    ]
    const roots = buildTree(spans)
    expect(roots).toHaveLength(2)
    // should be sorted by started_at
    expect(roots[0].span_id).toBe('b')
    expect(roots[1].span_id).toBe('a')
  })

  it('nests children under parent', () => {
    const spans = [
      makeSpan({ span_id: 'parent', started_at: '2026-01-01T00:00:00Z' }),
      makeSpan({ span_id: 'child', parent_span_id: 'parent', started_at: '2026-01-01T00:00:01Z' }),
    ]
    const roots = buildTree(spans)
    expect(roots).toHaveLength(1)
    expect(roots[0].span_id).toBe('parent')
    expect(roots[0].children).toHaveLength(1)
    expect(roots[0].children[0].span_id).toBe('child')
  })

  it('treats orphan spans (parent not in list) as roots', () => {
    const spans = [
      makeSpan({ span_id: 'orphan', parent_span_id: 'nonexistent' }),
    ]
    const roots = buildTree(spans)
    expect(roots).toHaveLength(1)
    expect(roots[0].span_id).toBe('orphan')
  })
})

describe('flatten', () => {
  it('returns empty array for empty roots', () => {
    expect(flatten([], new Set())).toEqual([])
  })

  it('flattens a tree with depth info', () => {
    const spans = [
      makeSpan({ span_id: 'root', started_at: '2026-01-01T00:00:00Z' }),
      makeSpan({ span_id: 'child', parent_span_id: 'root', started_at: '2026-01-01T00:00:01Z' }),
    ]
    const roots = buildTree(spans)
    const flat = flatten(roots, new Set())
    expect(flat).toHaveLength(2)
    expect(flat[0].depth).toBe(0)
    expect(flat[0].hasChildren).toBe(true)
    expect(flat[1].depth).toBe(1)
    expect(flat[1].hasChildren).toBe(false)
  })

  it('respects collapsed set — hides children of collapsed nodes', () => {
    const spans = [
      makeSpan({ span_id: 'root', started_at: '2026-01-01T00:00:00Z' }),
      makeSpan({ span_id: 'child', parent_span_id: 'root', started_at: '2026-01-01T00:00:01Z' }),
    ]
    const roots = buildTree(spans)
    const flat = flatten(roots, new Set(['root']))
    expect(flat).toHaveLength(1)
    expect(flat[0].isCollapsed).toBe(true)
  })
})

describe('calcTicks', () => {
  it('returns [0] for zero or negative totalMs', () => {
    expect(calcTicks(0)).toEqual({ step: 0, ticks: [0] })
    expect(calcTicks(-10)).toEqual({ step: 0, ticks: [0] })
  })

  it('generates reasonable tick count', () => {
    const result = calcTicks(1000)
    expect(result.ticks.length).toBeGreaterThanOrEqual(2)
    expect(result.ticks[0]).toBe(0)
    expect(result.step).toBeGreaterThan(0)
  })

  it('respects targetCount hint', () => {
    const result = calcTicks(10000, 5)
    // step should be chosen so ~5 ticks are generated
    expect(result.ticks.length).toBeLessThanOrEqual(10)
  })
})

describe('formatTickLabel', () => {
  it('formats 0 as "0"', () => {
    expect(formatTickLabel(0)).toBe('0')
  })

  it('formats < 1000 as ms', () => {
    expect(formatTickLabel(500)).toBe('500ms')
  })

  it('formats integer seconds without decimal', () => {
    expect(formatTickLabel(2000)).toBe('2s')
  })

  it('formats fractional seconds with one decimal', () => {
    expect(formatTickLabel(1500)).toBe('1.5s')
  })
})

describe('positionSpan', () => {
  it('returns zeros for non-positive totalMs', () => {
    const span = makeSpan({ span_id: 'a' })
    expect(positionSpan(span, 0, 0)).toEqual({ leftPct: 0, widthPct: 0 })
  })

  it('calculates left and width percentages', () => {
    const traceStart = new Date('2026-01-01T00:00:00Z').getTime()
    const span = makeSpan({
      span_id: 'a',
      started_at: '2026-01-01T00:00:01Z',
      duration_ms: 500,
    })
    const result = positionSpan(span, traceStart, 10000)
    expect(result.leftPct).toBeCloseTo(10) // 1000ms / 10000ms * 100
    expect(result.widthPct).toBeCloseTo(5)  // 500ms / 10000ms * 100
  })

  it('enforces minimum widthPct of 0.3', () => {
    const traceStart = new Date('2026-01-01T00:00:00Z').getTime()
    const span = makeSpan({
      span_id: 'a',
      started_at: '2026-01-01T00:00:00Z',
      duration_ms: 0,
    })
    const result = positionSpan(span, traceStart, 10000)
    expect(result.widthPct).toBe(0.3)
  })
})
