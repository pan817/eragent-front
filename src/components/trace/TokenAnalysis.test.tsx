import { render, screen, fireEvent } from '@testing-library/react'
import TokenAnalysis from './TokenAnalysis'
import type { TraceSpan } from '../../types/api'

// Mock recharts — render children but skip SVG rendering
vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const makeSpan = (overrides: Partial<TraceSpan> = {}): TraceSpan => ({
  span_id: 's-1',
  trace_id: 'tr-1',
  parent_span_id: null,
  span_type: 'tool',
  name: 'test',
  status: 'success',
  started_at: '2026-01-01T00:00:00Z',
  finished_at: '2026-01-01T00:00:01Z',
  duration_ms: 1000,
  attributes: {},
  error: null,
  ...overrides,
})

describe('TokenAnalysis', () => {
  it('renders nothing when no context_budget or model spans', () => {
    const spans = [makeSpan({ span_type: 'tool' })]
    const { container } = render(
      <TokenAnalysis spans={spans} budgetWarningThreshold={80} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders section title when model spans exist', () => {
    const spans = [
      makeSpan({
        span_id: 'm-1',
        span_type: 'model',
        name: 'gpt-4',
        attributes: { usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } },
      }),
    ]
    render(<TokenAnalysis spans={spans} budgetWarningThreshold={80} />)

    expect(screen.getByText('Token 消耗分析')).toBeInTheDocument()
  })

  it('renders model token table', () => {
    const spans = [
      makeSpan({
        span_id: 'm-1',
        span_type: 'model',
        name: 'gpt-4',
        duration_ms: 1500,
        attributes: { usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } },
      }),
    ]
    render(<TokenAnalysis spans={spans} budgetWarningThreshold={80} />)

    // "gpt-4" appears in both pie tab and table row
    expect(screen.getAllByText('gpt-4').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('1.5s')).toBeInTheDocument()
  })

  it('renders totals row when multiple model spans', () => {
    const spans = [
      makeSpan({
        span_id: 'm-1', span_type: 'model', name: 'model-a',
        attributes: { usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } },
      }),
      makeSpan({
        span_id: 'm-2', span_type: 'model', name: 'model-b',
        attributes: { usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300 } },
      }),
    ]
    render(<TokenAnalysis spans={spans} budgetWarningThreshold={80} />)

    expect(screen.getByText('合计')).toBeInTheDocument()
    expect(screen.getAllByText('300').length).toBeGreaterThanOrEqual(1) // total input = 300
    expect(screen.getByText('450')).toBeInTheDocument() // total total
  })

  it('shows estimated prefix for estimated tokens', () => {
    const spans = [
      makeSpan({
        span_id: 'm-1', span_type: 'model', name: 'model',
        attributes: { estimated_input_tokens: 500 },
      }),
    ]
    render(<TokenAnalysis spans={spans} budgetWarningThreshold={80} />)

    expect(screen.getByText('~500')).toBeInTheDocument()
  })

  it('renders context budget tab and pie chart', () => {
    const spans = [
      makeSpan({
        span_id: 'cb-1',
        span_type: 'context_budget',
        name: 'budget-check',
        attributes: {
          total_inject_tokens: 8000,
          model_context_limit: 10000,
          budget_usage_pct: 80,
          system_prompt_tokens: 3000,
          user_message_tokens: 5000,
        },
      }),
    ]
    render(<TokenAnalysis spans={spans} budgetWarningThreshold={80} />)

    expect(screen.getByText('Context Budget')).toBeInTheDocument()
    expect(screen.getByText('budget-check')).toBeInTheDocument()
    expect(screen.getByText('80.0%')).toBeInTheDocument()
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('switches tabs between budget and model span', () => {
    const spans = [
      makeSpan({
        span_id: 'cb-1', span_type: 'context_budget', name: 'budget',
        attributes: { total_inject_tokens: 5000, model_context_limit: 10000, budget_usage_pct: 50 },
      }),
      makeSpan({
        span_id: 'm-1', span_type: 'model', name: 'my-model',
        attributes: { input: 'hello', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
      }),
    ]
    render(<TokenAnalysis spans={spans} budgetWarningThreshold={80} />)

    // Click model tab (pie-tab button)
    const modelTab = document.querySelector('.pie-tab:not(.is-active)') as HTMLElement
    fireEvent.click(modelTab)

    // Should show model pie chart area
    expect(screen.getByText('Input vs Output')).toBeInTheDocument()
  })

  it('calls onSelectSpan when model row is clicked', () => {
    const onSelectSpan = vi.fn()
    const spans = [
      makeSpan({
        span_id: 'm-1', span_type: 'model', name: 'my-model',
        attributes: { usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } },
      }),
    ]
    render(<TokenAnalysis spans={spans} budgetWarningThreshold={80} onSelectSpan={onSelectSpan} />)

    const row = document.querySelector('.model-token-row') as HTMLElement
    fireEvent.click(row)
    expect(onSelectSpan).toHaveBeenCalledWith('m-1')
  })

  it('shows ms for durations under 1000ms', () => {
    const spans = [
      makeSpan({
        span_id: 'm-1', span_type: 'model', name: 'fast',
        duration_ms: 500,
        attributes: { usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
      }),
    ]
    render(<TokenAnalysis spans={spans} budgetWarningThreshold={80} />)

    expect(screen.getByText('500ms')).toBeInTheDocument()
  })
})
