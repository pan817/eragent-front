import { render, screen, fireEvent } from '@testing-library/react'
import FeedbackButton from './FeedbackButton'

vi.mock('./FeedbackButton.css', () => ({}))

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
    expect(screen.getByText('反馈')).toBeInTheDocument()
  })

  it('shows coming soon message', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    expect(screen.getByText('功能未上线')).toBeInTheDocument()
    expect(screen.getByText('反馈功能正在开发中，敬请期待！')).toBeInTheDocument()
  })

  it('closes dialog on "我知道了" button', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByText('我知道了'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes dialog on close button', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    fireEvent.click(screen.getByLabelText('关闭'))
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

  it('does not close on dialog body click (stopPropagation)', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByLabelText('提交反馈'))

    const dialog = document.querySelector('.feedback-dialog')!
    fireEvent.click(dialog)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
