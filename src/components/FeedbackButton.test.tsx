import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackButton from './FeedbackButton'

vi.mock('./FeedbackButton.css', () => ({}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FeedbackButton', () => {
  it('renders the FAB button', () => {
    render(<FeedbackButton />)
    expect(screen.getByLabelText('提交反馈')).toBeInTheDocument()
    expect(screen.getByText('Feedback')).toBeInTheDocument()
  })

  it('opens dialog on click', () => {
    render(<FeedbackButton />)

    fireEvent.click(screen.getByLabelText('提交反馈'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('提交反馈', { selector: 'h3' })).toBeInTheDocument()
  })

  it('shows feedback type chips', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    expect(screen.getByText('Bug')).toBeInTheDocument()
    expect(screen.getByText('建议')).toBeInTheDocument()
    expect(screen.getByText('其他')).toBeInTheDocument()
  })

  it('shows textarea with placeholder', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    expect(screen.getByPlaceholderText('告诉我们你遇到的问题或建议...')).toBeInTheDocument()
  })

  it('submit button is disabled when textarea is empty', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    expect(screen.getByText('提交', { selector: 'button' })).toBeDisabled()
  })

  it('submit button is enabled when textarea has content', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    await userEvent.type(screen.getByPlaceholderText('告诉我们你遇到的问题或建议...'), '一个建议')

    expect(screen.getByText('提交', { selector: 'button' })).not.toBeDisabled()
  })

  it('shows character count', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    await userEvent.type(screen.getByPlaceholderText('告诉我们你遇到的问题或建议...'), 'hello')

    expect(screen.getByText('5 / 500')).toBeInTheDocument()
  })

  it('shows success message after submit', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    await userEvent.type(screen.getByPlaceholderText('告诉我们你遇到的问题或建议...'), '很好用')
    fireEvent.click(screen.getByText('提交', { selector: 'button' }))

    expect(screen.getByText(/已保存到本地/)).toBeInTheDocument()
  })

  it('can switch feedback type', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    const bugChip = screen.getByText('Bug').closest('button')!
    fireEvent.click(bugChip)

    expect(bugChip.classList.contains('is-active')).toBe(true)
  })

  it('closes dialog on close button', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('关闭'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes dialog on cancel button', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes dialog on Escape key', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes dialog on overlay click', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    const overlay = document.querySelector('.modal-overlay')!
    fireEvent.click(overlay)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
