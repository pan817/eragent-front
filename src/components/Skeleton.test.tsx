import { render } from '@testing-library/react'
import {
  Skeleton,
  TraceSummarySkeleton,
  TraceTopSpansSkeleton,
  ChartBlockSkeleton,
} from './Skeleton'

vi.mock('./Skeleton.css', () => ({}))

describe('Skeleton', () => {
  it('renders basic skeleton with given width/height', () => {
    const { container } = render(<Skeleton width={200} height={12} />)
    const el = container.querySelector('.skeleton') as HTMLElement
    expect(el).toBeInTheDocument()
    expect(el.style.width).toBe('200px')
    expect(el.style.height).toBe('12px')
  })

  it('accepts string width (percentages)', () => {
    const { container } = render(<Skeleton width="50%" />)
    const el = container.querySelector('.skeleton') as HTMLElement
    expect(el.style.width).toBe('50%')
  })

  it('applies round modifier class', () => {
    const { container } = render(<Skeleton rounded />)
    expect(container.querySelector('.skeleton--round')).toBeInTheDocument()
  })

  it('is aria-hidden so screen readers skip it', () => {
    const { container } = render(<Skeleton />)
    const el = container.querySelector('.skeleton') as HTMLElement
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('TraceSummarySkeleton', () => {
  it('renders default 6 summary cells', () => {
    const { container } = render(<TraceSummarySkeleton />)
    expect(container.querySelectorAll('.summary-item.skeleton-cell')).toHaveLength(6)
  })

  it('renders requested number of cells', () => {
    const { container } = render(<TraceSummarySkeleton cells={3} />)
    expect(container.querySelectorAll('.summary-item.skeleton-cell')).toHaveLength(3)
  })
})

describe('TraceTopSpansSkeleton', () => {
  it('renders default 5 rows', () => {
    const { container } = render(<TraceTopSpansSkeleton />)
    expect(container.querySelectorAll('.skeleton-top-item')).toHaveLength(5)
  })

  it('renders requested number of rows', () => {
    const { container } = render(<TraceTopSpansSkeleton rows={2} />)
    expect(container.querySelectorAll('.skeleton-top-item')).toHaveLength(2)
  })
})

describe('ChartBlockSkeleton', () => {
  it('renders fixed height block with bars', () => {
    const { container } = render(<ChartBlockSkeleton height={180} />)
    const chart = container.querySelector('.skeleton-chart') as HTMLElement
    expect(chart).toBeInTheDocument()
    expect(chart.style.height).toBe('180px')
    expect(container.querySelectorAll('.skeleton-chart-bar')).toHaveLength(8)
  })
})
