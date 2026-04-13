import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from './Sidebar'
import type { ChatSession } from '../hooks/useChatSessions'
import type { ChatMessage } from '../types/api'

vi.mock('./Sidebar.css', () => ({}))
vi.mock('./Avatar.css', () => ({}))
vi.mock('./ThemeToggle.css', () => ({}))
vi.mock('./InitDataButton.css', () => ({}))
vi.mock('./ThemeToggle', () => ({
  default: () => <button data-testid="theme-toggle">Theme</button>,
}))
vi.mock('./InitDataButton', () => ({
  default: () => <button data-testid="init-data-btn">Init</button>,
}))

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: 'sess-1',
  title: '测试会话',
  titleAuto: true,
  messageCount: 2,
  lastMessagePreview: '最新消息',
  createdAt: Date.now() - 60000,
  updatedAt: Date.now(),
  messages: [
    { id: 'm-1', role: 'user', content: '问题', timestamp: new Date() },
    { id: 'm-2', role: 'assistant', content: '回答', timestamp: new Date(), status: 'success', durationMs: 1500 },
  ],
  ...overrides,
})

const defaultProps = () => ({
  userId: 'alice' as string | null,
  messages: [
    { id: 'm-1', role: 'user' as const, content: '问题', timestamp: new Date() },
    { id: 'm-2', role: 'assistant' as const, content: '回答', timestamp: new Date(), status: 'success' as const, durationMs: 1500 },
  ] as ChatMessage[],
  sessions: [makeSession()],
  currentId: 'sess-1',
  filteredSessions: [makeSession()],
  search: '',
  onSearchChange: vi.fn(),
  onSwitchSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onRenameSession: vi.fn(),
  onClearAll: vi.fn(),
  onLoginClick: vi.fn(),
  onLogout: vi.fn(),
  onNewChat: vi.fn(),
  collapsed: false,
  onToggleCollapse: vi.fn(),
})

describe('Sidebar — layout', () => {
  it('renders brand name and subtitle', () => {
    render(<Sidebar {...defaultProps()} />)

    expect(screen.getByText('ERP Agent')).toBeInTheDocument()
    expect(screen.getByText('AI 采购分析助手')).toBeInTheDocument()
  })

  it('renders new chat button', () => {
    const props = defaultProps()
    render(<Sidebar {...props} />)

    const btn = screen.getByText('新建对话')
    fireEvent.click(btn.closest('button')!)
    expect(props.onNewChat).toHaveBeenCalled()
  })

  it('renders search input', () => {
    render(<Sidebar {...defaultProps()} />)
    expect(screen.getByPlaceholderText('搜索历史对话...')).toBeInTheDocument()
  })

  it('renders collapse button with correct aria-label', () => {
    const props = defaultProps()
    render(<Sidebar {...props} />)

    const collapseBtn = screen.getByLabelText('收起侧边栏')
    fireEvent.click(collapseBtn)
    expect(props.onToggleCollapse).toHaveBeenCalled()
  })

  it('shows expand label when collapsed', () => {
    render(<Sidebar {...defaultProps()} collapsed={true} />)
    expect(screen.getByLabelText('展开侧边栏')).toBeInTheDocument()
  })
})

describe('Sidebar — session list', () => {
  it('renders session items', () => {
    render(<Sidebar {...defaultProps()} />)
    expect(screen.getByText('测试会话')).toBeInTheDocument()
  })

  it('shows empty state when no sessions match', () => {
    const props = defaultProps()
    props.filteredSessions = []
    render(<Sidebar {...props} />)

    expect(screen.getByText('暂无历史对话')).toBeInTheDocument()
  })

  it('shows search empty state', () => {
    const props = defaultProps()
    props.filteredSessions = []
    props.search = '不存在'
    render(<Sidebar {...props} />)

    expect(screen.getByText('未找到匹配对话')).toBeInTheDocument()
  })

  it('marks current session as active', () => {
    render(<Sidebar {...defaultProps()} />)

    const option = screen.getByRole('option')
    expect(option).toHaveAttribute('aria-selected', 'true')
    expect(option.classList.contains('is-active')).toBe(true)
  })

  it('calls onSwitchSession when clicking a session', () => {
    const props = defaultProps()
    const session2 = makeSession({ id: 'sess-2', title: '第二个会话' })
    props.sessions = [makeSession(), session2]
    props.filteredSessions = [makeSession(), session2]

    render(<Sidebar {...props} />)

    const secondOption = screen.getByText('第二个会话').closest('[role="option"]')!
    fireEvent.click(secondOption)
    expect(props.onSwitchSession).toHaveBeenCalledWith('sess-2')
  })

  it('shows "新对话" in muted style for empty sessions', () => {
    const emptySession = makeSession({ messageCount: 0, messages: [] })
    const props = defaultProps()
    props.sessions = [emptySession]
    props.filteredSessions = [emptySession]

    render(<Sidebar {...props} />)

    const muted = document.querySelector('.is-muted')
    expect(muted).toBeInTheDocument()
    expect(muted?.textContent).toBe('新对话')
  })
})

describe('Sidebar — search', () => {
  it('calls onSearchChange on input', async () => {
    const props = defaultProps()
    render(<Sidebar {...props} />)

    const searchInput = screen.getByPlaceholderText('搜索历史对话...')
    await userEvent.type(searchInput, '采购')

    expect(props.onSearchChange).toHaveBeenCalled()
  })

  it('shows clear button when search has value', () => {
    const props = defaultProps()
    props.search = '采购'
    render(<Sidebar {...props} />)

    const clearBtn = screen.getByLabelText('清空搜索')
    expect(clearBtn).toBeInTheDocument()

    fireEvent.click(clearBtn)
    expect(props.onSearchChange).toHaveBeenCalledWith('')
  })

  it('hides clear button when search is empty', () => {
    render(<Sidebar {...defaultProps()} />)
    expect(screen.queryByLabelText('清空搜索')).not.toBeInTheDocument()
  })
})

describe('Sidebar — delete session', () => {
  it('shows confirm dialog when delete is clicked', () => {
    render(<Sidebar {...defaultProps()} />)

    const deleteBtn = screen.getByLabelText('删除对话')
    fireEvent.click(deleteBtn)

    expect(screen.getByText('删除这条对话？')).toBeInTheDocument()
    expect(screen.getByText('确认删除')).toBeInTheDocument()
  })

  it('calls onDeleteSession on confirm', () => {
    const props = defaultProps()
    render(<Sidebar {...props} />)

    fireEvent.click(screen.getByLabelText('删除对话'))
    fireEvent.click(screen.getByText('确认删除'))

    expect(props.onDeleteSession).toHaveBeenCalledWith('sess-1')
  })

  it('closes dialog on cancel', () => {
    render(<Sidebar {...defaultProps()} />)

    fireEvent.click(screen.getByLabelText('删除对话'))
    expect(screen.getByText('删除这条对话？')).toBeInTheDocument()

    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByText('删除这条对话？')).not.toBeInTheDocument()
  })
})

describe('Sidebar — clear all', () => {
  it('shows clear button when sessions have messages', () => {
    render(<Sidebar {...defaultProps()} />)
    expect(screen.getByText('清空')).toBeInTheDocument()
  })

  it('shows confirm dialog and calls onClearAll', () => {
    const props = defaultProps()
    render(<Sidebar {...props} />)

    fireEvent.click(screen.getByText('清空'))
    expect(screen.getByText('清空全部历史对话？')).toBeInTheDocument()

    fireEvent.click(screen.getByText('确认清空'))
    expect(props.onClearAll).toHaveBeenCalled()
  })
})

describe('Sidebar — rename session', () => {
  it('enters edit mode on double click', () => {
    render(<Sidebar {...defaultProps()} />)

    const sessionItem = screen.getByRole('option')
    fireEvent.doubleClick(sessionItem)

    // Should show an input with the current title
    const editInput = document.querySelector('.sidebar-history-item-edit') as HTMLInputElement
    expect(editInput).toBeInTheDocument()
    expect(editInput.value).toBe('测试会话')
  })

  it('enters edit mode via rename button', () => {
    render(<Sidebar {...defaultProps()} />)

    fireEvent.click(screen.getByLabelText('重命名对话'))

    const editInput = document.querySelector('.sidebar-history-item-edit') as HTMLInputElement
    expect(editInput).toBeInTheDocument()
  })

  it('commits edit on Enter and calls onRenameSession', () => {
    const props = defaultProps()
    render(<Sidebar {...props} />)

    fireEvent.click(screen.getByLabelText('重命名对话'))

    const editInput = document.querySelector('.sidebar-history-item-edit') as HTMLInputElement
    fireEvent.change(editInput, { target: { value: '新标题' } })
    fireEvent.keyDown(editInput, { key: 'Enter' })

    expect(props.onRenameSession).toHaveBeenCalledWith('sess-1', '新标题')
  })

  it('cancels edit on Escape', () => {
    render(<Sidebar {...defaultProps()} />)

    fireEvent.click(screen.getByLabelText('重命名对话'))

    const editInput = document.querySelector('.sidebar-history-item-edit') as HTMLInputElement
    fireEvent.keyDown(editInput, { key: 'Escape' })

    expect(document.querySelector('.sidebar-history-item-edit')).not.toBeInTheDocument()
  })
})

describe('Sidebar — user section', () => {
  it('shows username and logout button when logged in', () => {
    render(<Sidebar {...defaultProps()} />)

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByLabelText('退出登录')).toBeInTheDocument()
  })

  it('calls onLogout on click', () => {
    const props = defaultProps()
    render(<Sidebar {...props} />)

    fireEvent.click(screen.getByLabelText('退出登录'))
    expect(props.onLogout).toHaveBeenCalled()
  })

  it('shows login button when not logged in', () => {
    const props = defaultProps()
    props.userId = null
    render(<Sidebar {...props} />)

    const loginBtn = screen.getByText('登录')
    fireEvent.click(loginBtn)
    expect(props.onLoginClick).toHaveBeenCalled()
  })
})

describe('Sidebar — stats', () => {
  it('shows query count and duration stats', () => {
    render(<Sidebar {...defaultProps()} />)

    expect(screen.getByText('查询次数')).toBeInTheDocument()
    expect(screen.getByText('累计耗时')).toBeInTheDocument()
    expect(screen.getByText('平均耗时')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument() // 1 assistant success msg
  })
})

describe('Sidebar — keyboard navigation', () => {
  it('navigates sessions with arrow keys', () => {
    const session2 = makeSession({ id: 'sess-2', title: '第二个会话' })
    const props = defaultProps()
    props.sessions = [makeSession(), session2]
    props.filteredSessions = [makeSession(), session2]

    render(<Sidebar {...props} />)

    const listbox = screen.getByRole('listbox')
    const options = screen.getAllByRole('option')

    // Focus first option
    options[0].focus()
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })

    // Second option should now be focused
    expect(document.activeElement).toBe(options[1])
  })
})
