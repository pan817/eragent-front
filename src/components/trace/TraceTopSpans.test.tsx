import { render, screen, fireEvent } from '@testing-library/react'
import TraceTopSpans from './TraceTopSpans'
import type { TraceSpan } from '../../types/api'

const makeSpan = (id: string, name: string, durationMs: number, spanType = 'tool'): TraceSpan => ({
  span_id: id,
  trace_id: 'tr-1',
  parent_span_id: null,
  span_type: spanType,
  name,
  status: 'success',
  started_at: '2026-01-01T00:00:00Z',
  finished_at: '2026-01-01T00:00:01Z',
  duration_ms: durationMs,
  attributes: {},
  error: null,
})

describe('TraceTopSpans', () => {
  it('renders nothing when topSpans is empty', () => {
    const { container } = render(<TraceTopSpans topSpans={[]} onLocate={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders top spans with rank, name and duration', () => {
    const spans = [
      makeSpan('s1', 'slow-task', 500),
      makeSpan('s2', 'fast-task', 100),
    ]
    render(<TraceTopSpans topSpans={spans} onLocate={vi.fn()} />)

    expect(screen.getByText('耗时 Top 5')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('slow-task')).toBeInTheDocument()
    expect(screen.getByText('500ms')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('fast-task')).toBeInTheDocument()
  })

  it('calls onLocate when item is clicked', () => {
    const onLocate = vi.fn()
    const spans = [makeSpan('s1', 'task', 200)]
    render(<TraceTopSpans topSpans={spans} onLocate={onLocate} />)

    fireEvent.click(screen.getByText('task').closest('button')!)
    expect(onLocate).toHaveBeenCalledWith('s1')
  })

  it('applies span type color to dot', () => {
    const spans = [makeSpan('s1', 'model-call', 300, 'model')]
    render(<TraceTopSpans topSpans={spans} onLocate={vi.fn()} />)

    const dot = document.querySelector('.trace-top-dot') as HTMLElement
    expect(dot.style.background).toBe('rgb(16, 185, 129)') // #10b981
  })
})
