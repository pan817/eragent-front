import { render, screen } from '@testing-library/react'
import TokenTrend from './TokenTrend'

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('TokenTrend', () => {
  it('renders nothing when data is empty', () => {
    const { container } = render(
      <TokenTrend data={[]} loading={false} budgetWarningThreshold={80} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders section title and chart when data exists', () => {
    const data = [
      { time: '04/13 10:00', peakPrompt: 5000, budgetPct: 50 },
      { time: '04/13 11:00', peakPrompt: 8000, budgetPct: 80 },
    ]
    render(<TokenTrend data={data} loading={false} budgetWarningThreshold={80} />)

    expect(screen.getByText('Token 趋势（Session 内）')).toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    const data = [{ time: '04/13 10:00', peakPrompt: 5000, budgetPct: 50 }]
    render(<TokenTrend data={data} loading={true} budgetWarningThreshold={80} />)

    expect(screen.getByText('加载趋势数据...')).toBeInTheDocument()
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument()
  })

  it('renders chart instead of loading when not loading', () => {
    const data = [{ time: '04/13 10:00', peakPrompt: 5000, budgetPct: 50 }]
    render(<TokenTrend data={data} loading={false} budgetWarningThreshold={80} />)

    expect(screen.queryByText('加载趋势数据...')).not.toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })
})
