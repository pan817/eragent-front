import { render, screen, fireEvent, act } from '@testing-library/react'
import MessageBubble from './MessageBubble'
import type { ChatMessage } from '../types/api'

vi.mock('./MessageBubble.css', () => ({}))
vi.mock('./Avatar.css', () => ({}))
vi.mock('./MarkdownContent', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}))

const makeMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  role: 'assistant',
  content: '分析报告内容',
  timestamp: new Date(),
  status: 'success',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MessageBubble — user message', () => {
  it('renders user text as plain paragraph', () => {
    const msg = makeMsg({ role: 'user', content: '你好' })
    render(<MessageBubble message={msg} />)

    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument()
  })

  it('shows user avatar with userId seed', () => {
    const msg = makeMsg({ role: 'user', content: 'hi' })
    const { container } = render(<MessageBubble message={msg} userId="alice" />)

    expect(container.querySelector('.message-row-user')).toBeInTheDocument()
  })

  it('shows relative timestamp for user message', () => {
    const msg = makeMsg({ role: 'user', content: 'test' })
    render(<MessageBubble message={msg} />)

    // formatRelativeTime returns "刚刚" for recent timestamps
    expect(screen.getByText('刚刚')).toBeInTheDocument()
  })
})

describe('MessageBubble — assistant message', () => {
  it('renders markdown content for success status', async () => {
    const msg = makeMsg({ content: '# Report' })
    render(<MessageBubble message={msg} />)

    expect(await screen.findByTestId('markdown-content')).toHaveTextContent('# Report')
  })

  it('renders honest loading text for sending status (U1)', () => {
    const msg = makeMsg({ status: 'sending', content: '' })
    render(<MessageBubble message={msg} />)

    // U1: 不再轮播假阶段，展示诚实的"分析中"
    expect(screen.getByText('分析中')).toBeInTheDocument()
  })

  it('uses real stageText when available', () => {
    const msg = makeMsg({ status: 'sending', content: '', stageText: '正在查询采购订单' })
    render(<MessageBubble message={msg} />)

    expect(screen.getByText('正在查询采购订单')).toBeInTheDocument()
    expect(screen.queryByText('分析中')).not.toBeInTheDocument()
  })

  it('elapsed seconds update every second (U6)', () => {
    vi.useFakeTimers()
    const startedAt = new Date()
    const msg = makeMsg({ status: 'sending', content: '', timestamp: startedAt })
    render(<MessageBubble message={msg} />)

    // 初始 0s
    expect(screen.getByText(/\(0s\)/)).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText(/\(1s\)/)).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText(/\(3s\)/)).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('elapsed interval is cleared on unmount (no setState-after-unmount warning)', () => {
    vi.useFakeTimers()
    const msg = makeMsg({ status: 'sending', content: '', timestamp: new Date() })
    const { unmount } = render(<MessageBubble message={msg} />)

    unmount()

    // 卸载后再推进时钟，若 clearInterval 没生效会触发 React "setState on unmounted"
    // 走不到任何断言，这里靠 console.error spy 捕捉潜在警告
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => { vi.advanceTimersByTime(5000) })
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()

    vi.useRealTimers()
  })

  it('shows stop button when status=sending and onStop provided', () => {
    const onStop = vi.fn()
    const msg = makeMsg({ status: 'sending', content: '' })
    render(<MessageBubble message={msg} onStop={onStop} />)

    const stopBtn = screen.getByRole('button', { name: '停止分析' })
    expect(stopBtn).toBeInTheDocument()
  })

  it('does not show stop button when status != sending', () => {
    const onStop = vi.fn()
    const msg = makeMsg({ status: 'success' })
    render(<MessageBubble message={msg} onStop={onStop} />)

    expect(screen.queryByRole('button', { name: '停止分析' })).not.toBeInTheDocument()
  })

  it('does not show stop button when onStop not provided', () => {
    const msg = makeMsg({ status: 'sending', content: '' })
    render(<MessageBubble message={msg} />)

    expect(screen.queryByRole('button', { name: '停止分析' })).not.toBeInTheDocument()
  })

  it('calls onStop with message id when stop clicked', () => {
    const onStop = vi.fn()
    const msg = makeMsg({ id: 'a-7', status: 'sending', content: '' })
    render(<MessageBubble message={msg} onStop={onStop} />)

    fireEvent.click(screen.getByRole('button', { name: '停止分析' }))
    expect(onStop).toHaveBeenCalledWith('a-7')
  })

  it('renders error block for error status', () => {
    const msg = makeMsg({ status: 'error', content: '服务器错误' })
    render(<MessageBubble message={msg} />)

    expect(screen.getByText('服务器错误')).toBeInTheDocument()
    expect(screen.getByText('请稍后重试，或检查网络连接')).toBeInTheDocument()
  })

  it('shows retry button in error state when onRegenerate provided', () => {
    const onRegenerate = vi.fn()
    const msg = makeMsg({ status: 'error', content: '失败' })
    render(<MessageBubble message={msg} onRegenerate={onRegenerate} />)

    const retryBtn = screen.getByText('点击重试')
    expect(retryBtn).toBeInTheDocument()

    fireEvent.click(retryBtn.closest('button')!)
    expect(onRegenerate).toHaveBeenCalledWith('msg-1')
  })

  it('does not show retry button without onRegenerate', () => {
    const msg = makeMsg({ status: 'error', content: '失败' })
    render(<MessageBubble message={msg} />)

    expect(screen.queryByText('点击重试')).not.toBeInTheDocument()
  })
})

describe('MessageBubble — toolbar (success state)', () => {
  it('shows timestamp and duration', () => {
    const msg = makeMsg({ durationMs: 2500 })
    render(<MessageBubble message={msg} />)

    expect(screen.getByText('刚刚')).toBeInTheDocument()
    expect(screen.getByText('⚡ 2.5s')).toBeInTheDocument()
  })

  it('shows trace button when traceId and onTraceClick provided', () => {
    const onTraceClick = vi.fn()
    const msg = makeMsg({ traceId: 'tr-1' })
    render(<MessageBubble message={msg} onTraceClick={onTraceClick} />)

    const traceBtn = screen.getByText('耗时详情')
    expect(traceBtn).toBeInTheDocument()

    fireEvent.click(traceBtn.closest('button')!)
    expect(onTraceClick).toHaveBeenCalledWith('tr-1')
  })

  it('does not show trace button without traceId', () => {
    const msg = makeMsg()
    render(<MessageBubble message={msg} onTraceClick={vi.fn()} />)

    expect(screen.queryByText('耗时详情')).not.toBeInTheDocument()
  })

  it('shows export button and dropdown on click', () => {
    const msg = makeMsg()
    render(<MessageBubble message={msg} />)

    const exportBtn = screen.getByText('导出')
    fireEvent.click(exportBtn.closest('button')!)

    expect(screen.getByText('复制 Markdown')).toBeInTheDocument()
    expect(screen.getByText('复制纯文本')).toBeInTheDocument()
    expect(screen.getByText('打印 / 导出 PDF')).toBeInTheDocument()
  })

  it('shows regenerate button when onRegenerate provided', () => {
    const onRegenerate = vi.fn()
    const msg = makeMsg()
    render(<MessageBubble message={msg} onRegenerate={onRegenerate} />)

    const regenBtn = screen.getByText('重新生成')
    fireEvent.click(regenBtn.closest('button')!)
    expect(onRegenerate).toHaveBeenCalledWith('msg-1')
  })
})

describe('MessageBubble — copy functionality', () => {
  it('copies markdown content to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const msg = makeMsg({ content: '# Hello' })
    render(<MessageBubble message={msg} />)

    // Open export menu
    fireEvent.click(screen.getByText('导出').closest('button')!)
    // Click "复制 Markdown"
    fireEvent.click(screen.getByText('复制 Markdown'))

    expect(writeText).toHaveBeenCalledWith('# Hello')
  })

  it('copies plain text content (stripped markdown)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const msg = makeMsg({ content: '**加粗文字**' })
    render(<MessageBubble message={msg} />)

    fireEvent.click(screen.getByText('导出').closest('button')!)
    fireEvent.click(screen.getByText('复制纯文本'))

    expect(writeText).toHaveBeenCalledWith('加粗文字')
  })
})

describe('MessageBubble — retrying state', () => {
  it('shows loading UI when status changes from error to sending (regenerate)', () => {
    const msg = makeMsg({ status: 'error', content: '失败' })
    const onRegenerate = vi.fn()
    const { rerender } = render(<MessageBubble message={msg} onRegenerate={onRegenerate} />)

    expect(screen.getByText('点击重试')).toBeInTheDocument()

    // Status changes to sending (regenerate triggered) — shows loading UI
    const retryingMsg = makeMsg({ status: 'sending', content: '' })
    rerender(<MessageBubble message={retryingMsg} onRegenerate={onRegenerate} />)

    expect(screen.getByText('分析中')).toBeInTheDocument()
    expect(screen.queryByText('点击重试')).not.toBeInTheDocument()
  })

  it('U4: retry button hidden for INTENT_UNCLEAR errors', () => {
    const msg = makeMsg({
      status: 'error',
      content: '未能理解你的问题',
      errorCode: 'INTENT_UNCLEAR',
    })
    const onRegenerate = vi.fn()
    render(<MessageBubble message={msg} onRegenerate={onRegenerate} />)

    expect(screen.queryByText('点击重试')).not.toBeInTheDocument()
    expect(
      screen.getByText('这类问题重试也会得到相同结果，请尝试换一个问法')
    ).toBeInTheDocument()
  })

  it('U3: degraded-to-polling shows dedicated text', () => {
    const msg = makeMsg({
      status: 'sending',
      content: '',
      degradedToPolling: true,
    })
    render(<MessageBubble message={msg} />)

    expect(screen.getByText('网络不稳定，正在查询结果')).toBeInTheDocument()
  })

  it('U2: resumedAt shows resume banner', () => {
    const msg = makeMsg({
      status: 'sending',
      content: '',
      resumedAt: Date.now(),
    })
    render(<MessageBubble message={msg} />)

    expect(screen.getByText(/已恢复上次未完成的分析/)).toBeInTheDocument()
  })
})
