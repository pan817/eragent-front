import { render, screen, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import TraceGantt from './TraceGantt'
import type { FlatNode, SpanNode } from '../../utils/traceTree'

const makeNode = (id: string, name: string, depth = 0, hasChildren = false): FlatNode => {
  const span: SpanNode = {
    span_id: id,
    trace_id: 'tr-1',
    parent_span_id: null,
    span_type: 'tool',
    name,
    status: 'success',
    started_at: '2026-01-01T00:00:00Z',
    finished_at: '2026-01-01T00:00:01Z',
    duration_ms: 1000,
    attributes: {},
    error: null,
    children: [],
  }
  return {
    span,
    depth,
    hasChildren,
    isCollapsed: false,
    ancestorsLast: Array(depth).fill(false),
  }
}

function Wrapper(props: Omit<React.ComponentProps<typeof TraceGantt>, 'rowRefs'>) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  return <TraceGantt {...props} rowRefs={rowRefs} />
}

const defaultProps = {
  flatNodes: [makeNode('s1', 'task-a'), makeNode('s2', 'task-b')],
  ticks: [0, 500, 1000],
  totalMs: 1000,
  traceStartMs: new Date('2026-01-01T00:00:00Z').getTime(),
  typeFilter: 'all',
  selectedSpanId: null,
  flashedId: null,
  onToggleCollapsed: vi.fn(),
  onToggleDetail: vi.fn(),
}

describe('TraceGantt', () => {
  it('renders header with column labels', () => {
    render(<Wrapper {...defaultProps} />)

    expect(screen.getByText('名称')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('500ms')).toBeInTheDocument()
    expect(screen.getByText('1s')).toBeInTheDocument()
  })

  it('renders span names in tree rows', () => {
    render(<Wrapper {...defaultProps} />)

    expect(screen.getByText('task-a')).toBeInTheDocument()
    expect(screen.getByText('task-b')).toBeInTheDocument()
  })

  it('renders duration labels', () => {
    render(<Wrapper {...defaultProps} />)

    const durations = screen.getAllByText('1000.0ms')
    expect(durations.length).toBe(2)
  })

  it('calls onToggleDetail when tree row is clicked', () => {
    const onToggleDetail = vi.fn()
    render(<Wrapper {...defaultProps} onToggleDetail={onToggleDetail} />)

    fireEvent.click(screen.getByText('task-a'))
    expect(onToggleDetail).toHaveBeenCalledWith('s1')
  })

  it('calls onToggleDetail when bar is clicked', () => {
    const onToggleDetail = vi.fn()
    render(<Wrapper {...defaultProps} onToggleDetail={onToggleDetail} />)

    const bars = document.querySelectorAll('.gantt-bar')
    fireEvent.click(bars[0])
    expect(onToggleDetail).toHaveBeenCalledWith('s1')
  })

  it('renders chevron for nodes with children', () => {
    const nodes = [makeNode('s1', 'parent', 0, true)]
    render(<Wrapper {...defaultProps} flatNodes={nodes} />)

    const chevron = document.querySelector('.tree-chevron:not(.is-hidden)')
    expect(chevron).toBeInTheDocument()
  })

  it('calls onToggleCollapsed when chevron is clicked', () => {
    const onToggleCollapsed = vi.fn()
    const nodes = [makeNode('s1', 'parent', 0, true)]
    render(<Wrapper {...defaultProps} flatNodes={nodes} onToggleCollapsed={onToggleCollapsed} />)

    const chevron = document.querySelector('.tree-chevron:not(.is-hidden)') as HTMLElement
    fireEvent.click(chevron)
    expect(onToggleCollapsed).toHaveBeenCalledWith('s1')
  })

  it('applies is-expanded class to selected row', () => {
    render(<Wrapper {...defaultProps} selectedSpanId="s1" />)

    const rows = document.querySelectorAll('.gantt-row')
    expect(rows[0].classList.contains('is-expanded')).toBe(true)
    expect(rows[1].classList.contains('is-expanded')).toBe(false)
  })

  it('applies is-flashed class to flashed row', () => {
    render(<Wrapper {...defaultProps} flashedId="s2" />)

    const rows = document.querySelectorAll('.gantt-row')
    expect(rows[1].classList.contains('is-flashed')).toBe(true)
  })

  it('dims rows that do not match typeFilter', () => {
    render(<Wrapper {...defaultProps} typeFilter="agent" />)

    const treeRows = document.querySelectorAll('.gantt-row-tree') as NodeListOf<HTMLElement>
    expect(treeRows[0].style.opacity).toBe('0.35')
  })
})
