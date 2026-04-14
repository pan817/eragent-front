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
    const tableContent = `| A | B |
|---|---|
| 1 | 2 |`
    render(<MarkdownContent content={tableContent} />)
    const wrapper = document.querySelector('.table-wrapper')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper?.querySelector('table')).toBeInTheDocument()
  })

  it('renders severity badges in table cells', () => {
    const tableContent = `| Status |
|---|
| HIGH |`
    render(<MarkdownContent content={tableContent} />)
    const badge = document.querySelector('.severity-badge.severity-high')
    expect(badge).toBeInTheDocument()
    expect(badge?.textContent).toBe('HIGH')
  })

  it('renders multiple severity levels', () => {
    const tableContent = `| A | B | C |
|---|---|---|
| LOW | MEDIUM | CRITICAL |`
    render(<MarkdownContent content={tableContent} />)
    expect(document.querySelector('.severity-low')).toBeInTheDocument()
    expect(document.querySelector('.severity-medium')).toBeInTheDocument()
    expect(document.querySelector('.severity-critical')).toBeInTheDocument()
  })

  it('renders GFM strikethrough', () => {
    render(<MarkdownContent content="~~deleted~~" />)
    expect(screen.getByText('deleted').tagName).toBe('DEL')
  })

  it('renders code blocks', () => {
    const codeContent = `\`\`\`
code here
\`\`\``
    render(<MarkdownContent content={codeContent} />)
    expect(screen.getByText('code here')).toBeInTheDocument()
  })

  it('has markdown-body wrapper class', () => {
    const { container } = render(<MarkdownContent content="test" />)
    expect(container.querySelector('.markdown-body')).toBeInTheDocument()
  })
})
