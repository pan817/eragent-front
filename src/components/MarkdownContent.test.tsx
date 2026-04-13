import { render, screen } from '@testing-library/react'
import MarkdownContent from './MarkdownContent'

describe('MarkdownContent', () => {
  it('renders plain text', () => {
    render(<MarkdownContent content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders markdown heading', () => {
    render(<MarkdownContent content="# Title" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title')
  })

  it('renders markdown bold text', () => {
    render(<MarkdownContent content="**bold**" />)
    expect(screen.getByText('bold')).toBeInTheDocument()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('renders markdown links with target=_blank', () => {
    render(<MarkdownContent content="[click](https://example.com)" />)
    const link = screen.getByText('click')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('wraps tables in table-wrapper div', () => {
    render(<MarkdownContent content="| A | B |\n|---|---|\n| 1 | 2 |" />)
    const wrapper = document.querySelector('.table-wrapper')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper?.querySelector('table')).toBeInTheDocument()
  })

  it('renders severity badges in table cells', () => {
    render(<MarkdownContent content="| Status |\n|---|\n| HIGH |" />)
    const badge = document.querySelector('.severity-badge.severity-high')
    expect(badge).toBeInTheDocument()
    expect(badge?.textContent).toBe('HIGH')
  })

  it('renders multiple severity levels', () => {
    render(<MarkdownContent content="| A | B | C |\n|---|---|---|\n| LOW | MEDIUM | CRITICAL |" />)
    expect(document.querySelector('.severity-low')).toBeInTheDocument()
    expect(document.querySelector('.severity-medium')).toBeInTheDocument()
    expect(document.querySelector('.severity-critical')).toBeInTheDocument()
  })

  it('renders GFM features like strikethrough', () => {
    render(<MarkdownContent content="~~deleted~~" />)
    expect(screen.getByText('deleted').tagName).toBe('DEL')
  })

  it('renders code blocks', () => {
    render(<MarkdownContent content="```\ncode here\n```" />)
    expect(screen.getByText('code here')).toBeInTheDocument()
  })

  it('has markdown-body wrapper class', () => {
    const { container } = render(<MarkdownContent content="test" />)
    expect(container.querySelector('.markdown-body')).toBeInTheDocument()
  })
})
