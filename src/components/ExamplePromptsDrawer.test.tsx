import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExamplePromptsDrawer from './ExamplePromptsDrawer'
import { EXAMPLE_PROMPTS, CATEGORIES } from '../data/examplePrompts'

vi.mock('./ExamplePromptsDrawer.css', () => ({}))

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onPick: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  try { sessionStorage.clear() } catch { /* ignore */ }
})

describe('ExamplePromptsDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ExamplePromptsDrawer {...defaultProps} open={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders drawer with title when open', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    expect(screen.getByText('测试用例库')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows total prompt count', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)
    expect(screen.getByText(`${EXAMPLE_PROMPTS.length} 条`)).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)
    expect(screen.getByPlaceholderText('搜索问题关键词...')).toBeInTheDocument()
  })

  it('renders category filter chips', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    expect(screen.getByText('全部')).toBeInTheDocument()
    // First few categories should be visible (labels appear in both chip and group header)
    for (let i = 0; i < Math.min(5, CATEGORIES.length); i++) {
      expect(screen.getAllByText(CATEGORIES[i].label).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('shows "更多" button when categories > 5', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    if (CATEGORIES.length > 5) {
      expect(screen.getByText('更多')).toBeInTheDocument()
    }
  })

  it('expands all categories on "更多" click', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    if (CATEGORIES.length <= 5) return

    fireEvent.click(screen.getByText('更多'))

    // All categories should now be visible
    for (const c of CATEGORIES) {
      expect(screen.getAllByText(c.label).length).toBeGreaterThanOrEqual(1)
    }
    expect(screen.getByText('收起')).toBeInTheDocument()
  })

  it('filters prompts by category', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    const firstCategory = CATEGORIES[0]
    // Click the chip (first match), not the group header
    const chips = screen.getAllByText(firstCategory.label)
    fireEvent.click(chips[0].closest('button')!)

    // Items should only belong to selected category
    const items = document.querySelectorAll('.examples-item')
    const expectedCount = EXAMPLE_PROMPTS.filter(p => p.category === firstCategory.key).length
    expect(items.length).toBe(expectedCount)
  })

  it('filters prompts by search keyword', async () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    await userEvent.type(screen.getByPlaceholderText('搜索问题关键词...'), '采购')

    const items = document.querySelectorAll('.examples-item')
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThan(EXAMPLE_PROMPTS.length)
  })

  it('shows empty state when no search results', async () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    await userEvent.type(screen.getByPlaceholderText('搜索问题关键词...'), '完全不可能存在的关键词xyz')

    expect(screen.getByText('未找到匹配的问题')).toBeInTheDocument()
  })

  it('shows clear button in search when has value', async () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    await userEvent.type(screen.getByPlaceholderText('搜索问题关键词...'), '测试')

    const clearBtn = screen.getByLabelText('清空')
    expect(clearBtn).toBeInTheDocument()

    fireEvent.click(clearBtn)
    expect(screen.getByPlaceholderText('搜索问题关键词...')).toHaveValue('')
  })

  it('highlights search keyword in results', async () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    await userEvent.type(screen.getByPlaceholderText('搜索问题关键词...'), '采购')

    const marks = document.querySelectorAll('mark')
    expect(marks.length).toBeGreaterThan(0)
  })

  it('calls onPick and onClose when item is clicked', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<ExamplePromptsDrawer open={true} onClose={onClose} onPick={onPick} />)

    const firstItem = document.querySelector('.examples-item') as HTMLButtonElement
    fireEvent.click(firstItem)

    expect(onPick).toHaveBeenCalledWith(EXAMPLE_PROMPTS[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<ExamplePromptsDrawer open={true} onClose={onClose} onPick={vi.fn()} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on overlay click', () => {
    const onClose = vi.fn()
    render(<ExamplePromptsDrawer open={true} onClose={onClose} onPick={vi.fn()} />)

    const overlay = document.querySelector('.examples-backdrop')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on close button click', () => {
    const onClose = vi.fn()
    render(<ExamplePromptsDrawer open={true} onClose={onClose} onPick={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('关闭'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows editable badge for editable prompts', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    const editablePrompt = EXAMPLE_PROMPTS.find(p => p.editable)
    if (!editablePrompt) return

    expect(screen.getAllByText(/含参数/).length).toBeGreaterThan(0)
  })

  it('shows category descriptions in group headers', () => {
    render(<ExamplePromptsDrawer {...defaultProps} />)

    const firstCategory = CATEGORIES[0]
    expect(screen.getByText(firstCategory.description)).toBeInTheDocument()
  })
})
