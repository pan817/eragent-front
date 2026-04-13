import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from './Login'

// Mock CSS import
vi.mock('./Login.css', () => ({}))

describe('Login', () => {
  it('renders login form', () => {
    render(<Login onLogin={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows error when submitting empty username', async () => {
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    // Clear any pre-filled value
    const input = screen.getByPlaceholderText('请输入用户名')
    await userEvent.clear(input)

    // Submit via the button since form doesn't have implicit role with noValidate
    await userEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(screen.getByText('请输入用户名')).toBeInTheDocument()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('calls onLogin with trimmed username on submit', async () => {
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    const input = screen.getByPlaceholderText('请输入用户名')
    await userEvent.clear(input)
    await userEvent.type(input, 'alice')

    // Click the submit button
    const submitBtn = screen.getByRole('button', { name: '登录' })
    await userEvent.click(submitBtn)

    expect(onLogin).toHaveBeenCalledWith('alice')
  })

  it('shows close button when onCancel is provided', () => {
    const onCancel = vi.fn()
    render(<Login onLogin={vi.fn()} onCancel={onCancel} />)

    const closeBtn = screen.getByLabelText('关闭')
    expect(closeBtn).toBeInTheDocument()

    fireEvent.click(closeBtn)
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not show close button without onCancel', () => {
    render(<Login onLogin={vi.fn()} />)
    expect(screen.queryByLabelText('关闭')).not.toBeInTheDocument()
  })

  it('closes on ESC key when onCancel provided', () => {
    const onCancel = vi.fn()
    render(<Login onLogin={vi.fn()} onCancel={onCancel} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('closes on overlay click when onCancel provided', () => {
    const onCancel = vi.fn()
    render(<Login onLogin={vi.fn()} onCancel={onCancel} />)

    const overlay = document.querySelector('.login-overlay')!
    fireEvent.click(overlay, { target: overlay, currentTarget: overlay })
    expect(onCancel).toHaveBeenCalled()
  })
})
