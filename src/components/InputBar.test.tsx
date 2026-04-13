import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InputBar from './InputBar'

// Mock CSS and SlashCommandPanel
vi.mock('./InputBar.css', () => ({}))
vi.mock('./SlashCommandPanel', () => ({
  default: () => <div data-testid="slash-panel" />,
  getFilteredPrompts: () => [],
}))

const defaultProps = {
  onSend: vi.fn(),
  disabled: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InputBar', () => {
  it('renders textarea and send button', () => {
    render(<InputBar {...defaultProps} />)

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByLabelText('发送')).toBeInTheDocument()
  })

  it('send button is disabled when input is empty', () => {
    render(<InputBar {...defaultProps} />)
    expect(screen.getByLabelText('发送')).toBeDisabled()
  })

  it('send button is enabled when input has text', async () => {
    render(<InputBar {...defaultProps} />)

    await userEvent.type(screen.getByRole('textbox'), '你好')
    expect(screen.getByLabelText('发送')).not.toBeDisabled()
  })

  it('calls onSend and clears input on send button click', async () => {
    const onSend = vi.fn()
    render(<InputBar {...defaultProps} onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '测试消息')
    await userEvent.click(screen.getByLabelText('发送'))

    expect(onSend).toHaveBeenCalledWith(
      '测试消息',
      expect.objectContaining({
        role: 'general',
        outputMode: 'detailed',
        timeRange: '',
      }),
    )
    expect(textarea).toHaveValue('')
  })

  it('disables textarea when disabled prop is true', () => {
    render(<InputBar {...defaultProps} disabled={true} />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('does not call onSend when disabled', async () => {
    const onSend = vi.fn()
    render(<InputBar {...defaultProps} onSend={onSend} disabled={true} />)

    // Force a value (since disabled prevents typing)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'text' } })
    await userEvent.click(screen.getByLabelText('发送'))

    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows duration when lastDurationMs is provided', () => {
    render(<InputBar {...defaultProps} lastDurationMs={1500} />)
    expect(screen.getByText(/上次 1\.5s/)).toBeInTheDocument()
  })

  it('shows character count', async () => {
    render(<InputBar {...defaultProps} />)

    await userEvent.type(screen.getByRole('textbox'), 'abc')
    expect(screen.getByText('3 字')).toBeInTheDocument()
  })

  it('shows role selector with default "通用分析"', () => {
    render(<InputBar {...defaultProps} />)
    expect(screen.getByText('通用分析')).toBeInTheDocument()
  })

  it('shows output mode selector with default "详细报告"', () => {
    render(<InputBar {...defaultProps} />)
    expect(screen.getByText('详细报告')).toBeInTheDocument()
  })

  it('shows time range selector with default "不限时间"', () => {
    render(<InputBar {...defaultProps} />)
    expect(screen.getByText('不限时间')).toBeInTheDocument()
  })

  it('renders example and tips buttons when callbacks provided', () => {
    const onOpenExamples = vi.fn()
    const onOpenTips = vi.fn()

    render(
      <InputBar
        {...defaultProps}
        onOpenExamples={onOpenExamples}
        onOpenTips={onOpenTips}
      />,
    )

    expect(screen.getByText('示例')).toBeInTheDocument()
    expect(screen.getByText('测试数据')).toBeInTheDocument()
  })

  it('clicking 新提示 clears input', async () => {
    render(<InputBar {...defaultProps} />)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '一些内容')

    const newPromptBtn = screen.getByText('新提示')
    await userEvent.click(newPromptBtn)

    expect(textarea).toHaveValue('')
  })
})

describe('InputBar — role switching', () => {
  it('opens role menu and selects a role', async () => {
    const onSend = vi.fn()
    render(<InputBar {...defaultProps} onSend={onSend} />)

    // Click role trigger
    fireEvent.click(screen.getByText('通用分析').closest('button')!)

    // Should show role options
    expect(screen.getByText('采购分析师')).toBeInTheDocument()
    expect(screen.getByText('财务分析师')).toBeInTheDocument()
    expect(screen.getByText('供应链主管')).toBeInTheDocument()

    // Select 采购分析师
    fireEvent.click(screen.getByText('采购分析师').closest('button[role="option"]')!)

    // Should update display
    expect(screen.getByText('采购分析师')).toBeInTheDocument()

    // Send and verify role
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '测试')
    await userEvent.click(screen.getByLabelText('发送'))

    expect(onSend).toHaveBeenCalledWith(
      '测试',
      expect.objectContaining({ role: 'procurement' }),
    )
  })
})

describe('InputBar — output mode switching', () => {
  it('opens output mode menu and selects a mode', async () => {
    const onSend = vi.fn()
    render(<InputBar {...defaultProps} onSend={onSend} />)

    fireEvent.click(screen.getByText('详细报告').closest('button')!)

    expect(screen.getByText('简报摘要')).toBeInTheDocument()
    expect(screen.getByText('数据表格')).toBeInTheDocument()

    fireEvent.click(screen.getByText('简报摘要').closest('button[role="option"]')!)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '测试')
    await userEvent.click(screen.getByLabelText('发送'))

    expect(onSend).toHaveBeenCalledWith(
      '测试',
      expect.objectContaining({ outputMode: 'brief' }),
    )
  })
})

describe('InputBar — time range switching', () => {
  it('opens time range menu and selects a range', async () => {
    const onSend = vi.fn()
    render(<InputBar {...defaultProps} onSend={onSend} />)

    fireEvent.click(screen.getByText('不限时间').closest('button')!)

    expect(screen.getByText('最近 7 天')).toBeInTheDocument()
    expect(screen.getByText('最近 30 天')).toBeInTheDocument()

    fireEvent.click(screen.getByText('最近 30 天').closest('button[role="option"]')!)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '测试')
    await userEvent.click(screen.getByLabelText('发送'))

    expect(onSend).toHaveBeenCalledWith(
      '测试',
      expect.objectContaining({ timeRange: '30d' }),
    )
  })
})

describe('InputBar — keyboard behavior', () => {
  it('sends on Enter key press', async () => {
    const onSend = vi.fn()
    render(<InputBar {...defaultProps} onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '消息')
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onSend).toHaveBeenCalled()
  })

  it('does not send on Shift+Enter (inserts newline)', async () => {
    const onSend = vi.fn()
    render(<InputBar {...defaultProps} onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '消息')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('toggles send shortcut on click', () => {
    render(<InputBar {...defaultProps} />)

    // Find the shortcut toggle button by class
    const hintBtn = document.querySelector('.input-hint-button') as HTMLButtonElement
    fireEvent.click(hintBtn)

    // Should switch and show tip
    expect(screen.getByText(/已切换为/)).toBeInTheDocument()
  })

  it('opens slash command panel when / is typed', async () => {
    render(<InputBar {...defaultProps} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '/' } })

    expect(screen.getByTestId('slash-panel')).toBeInTheDocument()
  })

  it('closes slash panel when input no longer starts with /', async () => {
    render(<InputBar {...defaultProps} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '/' } })
    expect(screen.getByTestId('slash-panel')).toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(screen.queryByTestId('slash-panel')).not.toBeInTheDocument()
  })
})

describe('InputBar — keyboard menu navigation', () => {
  it('navigates role menu with arrow keys', () => {
    render(<InputBar {...defaultProps} />)

    const trigger = screen.getByText('通用分析').closest('button')!
    fireEvent.click(trigger)

    // Arrow down to move focus
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    // The focused item should have is-focused class
    const focused = document.querySelector('.input-role-item.is-focused')
    expect(focused).toBeInTheDocument()
  })

  it('selects role on Enter in menu', () => {
    render(<InputBar {...defaultProps} />)

    const trigger = screen.getByText('通用分析').closest('button')!
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Enter' })

    // Menu should close
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes role menu on Escape', () => {
    render(<InputBar {...defaultProps} />)

    const trigger = screen.getByText('通用分析').closest('button')!
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
