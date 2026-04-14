import { render, screen } from '@testing-library/react'
import TraceSummary from './TraceSummary'
import type { TraceResponse } from '../../types/api'

const makeData = (overrides: Partial<TraceResponse> = {}): TraceResponse => ({
  trace_id: 'tr-1',
  agent_name: 'test-agent',
  session_id: 'sess-1',
  user_id: 'alice',
  status: 'success',
  started_at: '2026-01-01T00:00:00Z',
  finished_at: '2026-01-01T00:00:02Z',
  duration_ms: 2000,
  model_call_count: 3,
  tool_call_count: 5,
  error: null,
  spans: [
    { span_id: 's1', trace_id: 'tr-1', parent_span_id: null, span_type: 'agent', name: 'root', status: 'success', started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:00:02Z', duration_ms: 2000, attributes: {}, error: null },
  ],
  ...overrides,
})

describe('TraceSummary', () => {
  it('renders basic summary items', () => {
    render(<TraceSummary data={makeData()} budgetWarningThreshold={80} />)

    expect(screen.getByText('总耗时')).toBeInTheDocument()
    expect(screen.getByText('2.00')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // model_call_count
    expect(screen.getByText('5')).toBeInTheDocument() // tool_call_count
    expect(screen.getByText('1')).toBeInTheDocument() // spans.length
  })

  it('shows success status with checkmark', () => {
    render(<TraceSummary data={makeData()} budgetWarningThreshold={80} />)
    expect(screen.getByText(/✓ success/)).toBeInTheDocument()
  })

  it('shows error status without checkmark', () => {
    render(<TraceSummary data={makeData({ status: 'error' })} budgetWarningThreshold={80} />)
    expect(screen.getByText('error')).toBeInTheDocument()
    expect(screen.queryByText(/✓/)).not.toBeInTheDocument()
  })

  it('shows token summary when available', () => {
    const data = makeData({
      token_summary: {
        total_prompt_tokens: 1000,
        total_completion_tokens: 500,
        peak_prompt_tokens: 800,
      },
    })
    render(<TraceSummary data={data} budgetWarningThreshold={80} />)

    expect(screen.getByText('Peak Prompt')).toBeInTheDocument()
    expect(screen.getByText('800')).toBeInTheDocument()
    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
    expect(screen.getByText('1,500')).toBeInTheDocument()
  })

  it('shows budget usage with danger class when above threshold', () => {
    const data = makeData({
      token_summary: {
        total_prompt_tokens: 1000,
        total_completion_tokens: 500,
        peak_prompt_tokens: 800,
        context_budget: {
          total_inject_tokens: 9000,
          model_context_limit: 10000,
          budget_usage_pct: 90,
        },
      },
    })
    render(<TraceSummary data={data} budgetWarningThreshold={80} />)

    expect(screen.getByText('Budget 使用率')).toBeInTheDocument()
    expect(screen.getByText('90.0')).toBeInTheDocument()
    const valueEl = screen.getByText('90.0').closest('.summary-value')
    expect(valueEl?.classList.contains('token-danger')).toBe(true)
  })

  it('renders trace meta info', () => {
    render(<TraceSummary data={makeData()} budgetWarningThreshold={80} />)

    expect(screen.getByText('Trace ID')).toBeInTheDocument()
    expect(screen.getByText('tr-1')).toBeInTheDocument()
    expect(screen.getByText('Session')).toBeInTheDocument()
    expect(screen.getByText('sess-1')).toBeInTheDocument()
  })
})
