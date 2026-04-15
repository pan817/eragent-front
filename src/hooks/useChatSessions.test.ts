import { renderHook, act } from '@testing-library/react'
import { useChatSessions } from './useChatSessions'

// Mock chatSessions service
vi.mock('../services/chatSessions', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  deleteSession: vi.fn(),
  clearAllSessions: vi.fn(),
  searchSessions: vi.fn(),
}))

import {
  listSessions as apiListSessions,
  createSession as apiCreateSession,
} from '../services/chatSessions'

const mockListSessions = vi.mocked(apiListSessions)
const mockCreateSession = vi.mocked(apiCreateSession)

beforeEach(() => {
  try { localStorage.removeItem('erp-agent-chat-sessions-v1') } catch { /* ignore */ }
  vi.clearAllMocks()
})

describe('useChatSessions — guest mode (userId=null)', () => {
  it('initializes with one empty session', () => {
    const { result } = renderHook(() => useChatSessions(null))

    expect(result.current.isGuestMode).toBe(true)
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.currentSession.messages).toEqual([])
    expect(result.current.currentSession.title).toBe('新对话')
  })

  it('setMessages updates current session messages', () => {
    const { result } = renderHook(() => useChatSessions(null))

    const msg = {
      id: 'msg-1',
      role: 'user' as const,
      content: '你好',
      timestamp: new Date(),
    }

    act(() => {
      result.current.setMessages([msg])
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toBe('你好')
  })

  it('setMessages with function updater', () => {
    const { result } = renderHook(() => useChatSessions(null))

    const msg = {
      id: 'msg-1',
      role: 'user' as const,
      content: '你好',
      timestamp: new Date(),
    }

    act(() => {
      result.current.setMessages(prev => [...prev, msg])
    })

    expect(result.current.messages).toHaveLength(1)
  })

  it('auto-derives title from first user message', () => {
    const { result } = renderHook(() => useChatSessions(null))

    act(() => {
      result.current.setMessages([
        { id: '1', role: 'user', content: '分析采购订单异常', timestamp: new Date() },
      ])
    })

    expect(result.current.currentSession.title).toBe('分析采购订单异常')
  })

  it('truncates long titles', () => {
    const { result } = renderHook(() => useChatSessions(null))

    act(() => {
      result.current.setMessages([
        { id: '1', role: 'user', content: '这是一段非常非常非常非常非常非常非常非常长的标题文本', timestamp: new Date() },
      ])
    })

    expect(result.current.currentSession.title.length).toBeLessThanOrEqual(25) // 24 chars + "…"
  })

  it('newChat creates a new session and switches to it', () => {
    const { result } = renderHook(() => useChatSessions(null))

    // Add a message so current session is not empty
    act(() => {
      result.current.setMessages([
        { id: '1', role: 'user', content: 'hello', timestamp: new Date() },
      ])
    })

    const oldId = result.current.currentId

    act(() => {
      result.current.newChat()
    })

    expect(result.current.currentId).not.toBe(oldId)
    expect(result.current.sessions.length).toBe(2)
    expect(result.current.currentSession.messages).toEqual([])
  })

  it('newChat does nothing when current session is empty', () => {
    const { result } = renderHook(() => useChatSessions(null))

    const oldId = result.current.currentId

    act(() => {
      result.current.newChat()
    })

    expect(result.current.currentId).toBe(oldId)
  })

  it('switchTo changes current session', () => {
    const { result } = renderHook(() => useChatSessions(null))

    // Create a second session
    act(() => {
      result.current.setMessages([
        { id: '1', role: 'user', content: 'first', timestamp: new Date() },
      ])
    })
    act(() => {
      result.current.newChat()
    })

    const newId = result.current.currentId
    const oldId = result.current.sessions.find(s => s.id !== newId)!.id

    act(() => {
      result.current.switchTo(oldId)
    })

    expect(result.current.currentId).toBe(oldId)
  })

  it('deleteSession removes session and switches if needed', () => {
    const { result } = renderHook(() => useChatSessions(null))

    // Add message, then create another session
    act(() => {
      result.current.setMessages([
        { id: '1', role: 'user', content: 'keep', timestamp: new Date() },
      ])
    })
    const firstId = result.current.currentId

    act(() => {
      result.current.newChat()
    })

    act(() => {
      result.current.deleteSession(result.current.currentId)
    })

    // Should fall back to the other session
    expect(result.current.sessions.some(s => s.id === firstId)).toBe(true)
  })

  it('clearAll replaces all sessions with one empty session', () => {
    const { result } = renderHook(() => useChatSessions(null))

    act(() => {
      result.current.setMessages([
        { id: '1', role: 'user', content: 'data', timestamp: new Date() },
      ])
    })

    act(() => {
      result.current.clearAll()
    })

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.currentSession.messages).toEqual([])
  })

  it('ensureRemoteSession returns currentId in guest mode', async () => {
    const { result } = renderHook(() => useChatSessions(null))

    let returnedId: string | undefined
    await act(async () => {
      returnedId = await result.current.ensureRemoteSession()
    })

    expect(returnedId).toBe(result.current.currentId)
  })

  it('filteredSessions filters by title and content', () => {
    const { result } = renderHook(() => useChatSessions(null))

    act(() => {
      result.current.setMessages([
        { id: '1', role: 'user', content: '采购订单查询', timestamp: new Date() },
      ])
    })

    act(() => {
      result.current.setSearch('采购')
    })

    expect(result.current.filteredSessions.length).toBe(1)

    act(() => {
      result.current.setSearch('不存在的关键词')
    })

    expect(result.current.filteredSessions.length).toBe(0)
  })

  it('renameSession updates title and sets titleAuto to false', () => {
    const { result } = renderHook(() => useChatSessions(null))

    const id = result.current.currentId

    act(() => {
      result.current.renameSession(id, '自定义标题')
    })

    expect(result.current.currentSession.title).toBe('自定义标题')
    expect(result.current.currentSession.titleAuto).toBe(false)
  })

  it('renameSession ignores empty string', () => {
    const { result } = renderHook(() => useChatSessions(null))

    act(() => {
      result.current.renameSession(result.current.currentId, '   ')
    })

    expect(result.current.currentSession.title).toBe('新对话')
  })

  it('survives re-render without losing state', () => {
    const { result, rerender } = renderHook(() => useChatSessions(null))

    act(() => {
      result.current.setMessages([
        { id: '1', role: 'user', content: 'persisted', timestamp: new Date() },
      ])
    })

    rerender()

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toBe('persisted')
  })
})

describe('useChatSessions — online mode (userId provided)', () => {
  it('fetches sessions from backend on mount', async () => {
    mockListSessions.mockResolvedValue({
      sessions: [],
      next_cursor: null,
    })

    const { result } = renderHook(() => useChatSessions('alice'))

    // Wait for async init
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockListSessions).toHaveBeenCalledWith('alice', { limit: 50 })
    expect(result.current.isGuestMode).toBe(false)
  })

  it('falls back to guest on list failure', async () => {
    mockListSessions.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useChatSessions('alice'))

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isGuestMode).toBe(true)
  })

  it('ensureRemoteSession calls createSession for temp sessions', async () => {
    mockListSessions.mockResolvedValue({ sessions: [], next_cursor: null })
    mockCreateSession.mockResolvedValue({
      session: {
        id: 'real-1',
        user_id: 'alice',
        title: '新对话',
        title_auto: true,
        message_count: 0,
        last_message_preview: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    })

    const { result } = renderHook(() => useChatSessions('alice'))

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Current session should be temp
    expect(result.current.currentId).toMatch(/^temp-/)

    let realId: string | undefined
    await act(async () => {
      realId = await result.current.ensureRemoteSession()
    })

    expect(realId).toBe('real-1')
    expect(mockCreateSession).toHaveBeenCalled()
  })

  it('loads session detail with messages for first session', async () => {
    const now = new Date().toISOString()
    mockListSessions.mockResolvedValue({
      sessions: [{
        id: 'sess-1',
        user_id: 'alice',
        title: '会话1',
        title_auto: true,
        message_count: 2,
        last_message_preview: '预览',
        created_at: now,
        updated_at: now,
      }],
      next_cursor: null,
    })

    const { getSession } = await import('../services/chatSessions')
    const mockGetSession = vi.mocked(getSession)
    mockGetSession.mockResolvedValue({
      session: {
        id: 'sess-1',
        user_id: 'alice',
        title: '会话1',
        title_auto: true,
        message_count: 2,
        last_message_preview: '预览',
        created_at: now,
        updated_at: now,
      },
      messages: [
        { id: 'm-1', session_id: 'sess-1', role: 'user', content: '问题', status: 'success', duration_ms: null, trace_id: null, created_at: now, metadata: null },
        { id: 'm-2', session_id: 'sess-1', role: 'assistant', content: '回答', status: 'success', duration_ms: 1000, trace_id: null, created_at: now, metadata: null },
      ],
      has_more_messages: false,
    })

    const { result } = renderHook(() => useChatSessions('alice'))

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.currentId).toBe('sess-1')
    expect(result.current.messages).toHaveLength(2)
  })

  it('commitSessionFromAnalyze updates session metadata', async () => {
    mockListSessions.mockResolvedValue({ sessions: [], next_cursor: null })

    const { result } = renderHook(() => useChatSessions('alice'))

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Simulate commitSessionFromAnalyze with a new session not in list
    act(() => {
      result.current.commitSessionFromAnalyze({
        id: 'new-sess',
        user_id: 'alice',
        title: '分析结果',
        title_auto: true,
        message_count: 2,
        last_message_preview: '报告',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    })

    // New session should be added to the list
    expect(result.current.sessions.some(s => s.id === 'new-sess')).toBe(true)
  })
})
