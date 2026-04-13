import { render, screen, fireEvent } from '@testing-library/react'
import SlashCommandPanel, { getFilteredPrompts } from './SlashCommandPanel'
import { EXAMPLE_PROMPTS } from '../data/examplePrompts'

vi.mock('./SlashCommandPanel.css', () => ({}))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('SlashCommandPanel', () => {
  const onPick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all prompts when filter is empty', () => {
    render(<SlashCommandPanel filter="" activeIndex={0} onPick={onPick} />)

    // Should show example titles
    const items = document.querySelectorAll('.slash-panel-item')
    expect(items.length).toBe(EXAMPLE_PROMPTS.length)
  })

  it('renders grouped by category with labels', () => {
    render(<SlashCommandPanel filter="" activeIndex={0} onPick={onPick} />)

    // Should show category group labels
    expect(screen.getByText('三路匹配')).toBeInTheDocument()
    expect(screen.getByText('价格差异')).toBeInTheDocument()
  })

  it('highlights active item', () => {
    render(<SlashCommandPanel filter="" activeIndex={0} onPick={onPick} />)

    const activeItem = document.querySelector('.slash-panel-item.is-active')
    expect(activeItem).toBeInTheDocument()
  })

  it('shows empty state when no results match', () => {
    render(<SlashCommandPanel filter="完全不存在的关键词xyz" activeIndex={0} onPick={onPick} />)

    expect(screen.getByText('未找到匹配的示例')).toBeInTheDocument()
  })

  it('filters by keyword', () => {
    render(<SlashCommandPanel filter="采购" activeIndex={0} onPick={onPick} />)

    // Should show fewer items than total
    const items = document.querySelectorAll('.slash-panel-item')
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThan(EXAMPLE_PROMPTS.length)
  })

  it('calls onPick on mousedown', () => {
    render(<SlashCommandPanel filter="" activeIndex={0} onPick={onPick} />)

    const firstItem = document.querySelector('.slash-panel-item')!
    fireEvent.mouseDown(firstItem)

    expect(onPick).toHaveBeenCalledWith(EXAMPLE_PROMPTS[0])
  })

  it('shows editable badge for editable prompts', () => {
    // Find an editable prompt
    const editablePrompt = EXAMPLE_PROMPTS.find(p => p.editable)
    if (!editablePrompt) return // skip if none exist

    render(<SlashCommandPanel filter={editablePrompt.title} activeIndex={0} onPick={onPick} />)

    expect(screen.getByText('可编辑')).toBeInTheDocument()
  })
})

describe('getFilteredPrompts', () => {
  it('returns all prompts for empty filter', () => {
    expect(getFilteredPrompts('')).toEqual(EXAMPLE_PROMPTS)
  })

  it('filters by title', () => {
    const results = getFilteredPrompts('采购')
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThan(EXAMPLE_PROMPTS.length)
  })

  it('filters by pinyin', () => {
    const results = getFilteredPrompts('caigou')
    expect(results.length).toBeGreaterThan(0)
  })

  it('returns empty array for no match', () => {
    const results = getFilteredPrompts('完全不可能匹配的字符串xyz')
    expect(results).toEqual([])
  })
})
