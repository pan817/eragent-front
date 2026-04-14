import { render, screen, fireEvent } from '@testing-library/react'
import SpanDrawer from './SpanDrawer'
import type { TraceSpan } from '../../types/api'

const makeSpan = (overrides: Partial<TraceSpan> = {}): TraceSpan => ({
  span_id: 's-1',
  trace_id: 'tr-1',
  parent_span_id: null,
  span_type: 'tool',
  name: 'fetch_data',
  status: 'success',
  started_at: '2026-01-01T00:00:00Z',
  finished_at: '2026-01-01T00:00:01Z',
  duration_ms: 1000,
  attributes: { key: 'value' },
  error: null,
  ...overrides,
})

describe('SpanDrawer', () => {
  it('renders span type badge and name', () => {
    render(<SpanDrawer span={makeSpan()} onClose={vi.fn()} />)

    expect(screen.getByText('tool')).toBeInTheDocument()
    expect(screen.getByText('fetch_data')).toBeInTheDocument()
  })

  it('renders span details', () => {
    render(<SpanDrawer span={makeSpan()} onClose={vi.fn()} />)

    expect(screen.getByText('Span ID')).toBeInTheDocument()
    expect(screen.getByText('s-1')).toBeInTheDocument()
    expect(screen.getByText('1000.0 ms')).toBeInTheDocument()
    expect(screen.getByText('success')).toBeInTheDocument()
  })

  it('shows error when span has error', () => {
    render(<SpanDrawer span={makeSpan({ error: '超时错误' })} onClose={vi.fn()} />)

    expect(screen.getByText('错误')).toBeInTheDocument()
    expect(screen.getByText('超时错误')).toBeInTheDocument()
  })

  it('does not show error row when no error', () => {
    render(<SpanDrawer span={makeSpan()} onClose={vi.fn()} />)
    expect(screen.queryByText('错误')).not.toBeInTheDocument()
  })

  it('shows token usage for model span', () => {
    const span = makeSpan({
      span_type: 'model',
      attributes: { usage: { input_tokens: 500, output_tokens: 200, total_tokens: 700 } },
    })
    render(<SpanDrawer span={span} onClose={vi.fn()} />)

    expect(screen.getByText('Token 消耗')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('700')).toBeInTheDocument()
  })

  it('shows estimated token label for estimated usage', () => {
    const span = makeSpan({
      span_type: 'model',
      attributes: { estimated_input_tokens: 800 },
    })
    render(<SpanDrawer span={span} onClose={vi.fn()} />)

    expect(screen.getByText(/Token 消耗（估算）/)).toBeInTheDocument()
    expect(screen.getByText('~800')).toBeInTheDocument()
  })

  it('does not show token section for non-model span', () => {
    render(<SpanDrawer span={makeSpan({ span_type: 'tool' })} onClose={vi.fn()} />)
    expect(screen.queryByText('Token 消耗')).not.toBeInTheDocument()
  })

  it('renders attributes JSON', () => {
    render(<SpanDrawer span={makeSpan()} onClose={vi.fn()} />)

    expect(screen.getByText('属性 (attributes)')).toBeInTheDocument()
    expect(screen.getByText(/"key": "value"/)).toBeInTheDocument()
  })

  it('calls onClose on close button click', () => {
    const onClose = vi.fn()
    render(<SpanDrawer span={makeSpan()} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('关闭'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn()
    render(<SpanDrawer span={makeSpan()} onClose={onClose} />)

    const backdrop = document.querySelector('.span-drawer-backdrop')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('renders as dialog', () => {
    render(<SpanDrawer span={makeSpan()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
