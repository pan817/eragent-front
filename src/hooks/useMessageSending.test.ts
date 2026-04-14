import { renderHook, act } from '@testing-library/react'
import { useMessageSending } from './useMessageSending'
import type { ChatMessage } from '../types/api'
import { resetToasts, subscribeToasts, type ToastItem } from '../utils/toast'

vi.mock('../services/constants', async () => {
  const actual = await vi.importActual<typeof import('../services/constants')>('../services/constants')
  return { ...actual, USE_ASYNC_ANALYZE: false }
})

vi.mock('../services/api', () => ({
  analyzeQuery: vi.fn(),
  submitAnalyzeAsync: vi.fn(),
  fetchTaskSnapshot: vi.fn(),
  taskEventStreamUrl: (tid: string) => `/stream/${tid}`,
}))

import { analyzeQuery } from '../services/api'

const mockAnalyzeQuery = vi.mocked(analyzeQuery)

const baseParams = () => ({
  userId: 'alice' as string | null,
  sessionId: 'sess-1',
  messages: [] as ChatMessage[],
  isGuestMode: false,
  setMessages: vi.fn(),
  ensureRemoteSession: vi.fn().mockResolvedValue('sess-1'),
  commitSessionFromAnalyze: vi.fn(),
  onNeedLogin: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
  resetToasts()
})

function collectToasts(): ToastItem[] {
  let latest: ToastItem[] = []
  const unsubscribe = subscribeToasts(items => {
    latest = items
  })
  unsubscribe()
  return latest
}

describe('useMessageSending', () => {
  it('initializes with loading=false', () => {
    const { result } = renderHook(() => useMessageSending(baseParams()))
    expect(result.current.loading).toBe(false)
  })

  it('calls onNeedLogin when userId is null', async () => {
    const params = baseParams()
    params.userId = null

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      await result.current.handleSend('hello')
    })

    expect(params.onNeedLogin).toHaveBeenCalledWith('hello')
    expect(mockAnalyzeQuery).not.toHaveBeenCalled()
  })

  it('calls ensureRemoteSession and analyzeQuery on send', async () => {
    const params = baseParams()
    mockAnalyzeQuery.mockResolvedValue({
      report_id: 'r-1',
      status: 'success',
      report_markdown: '# Report',
      analysis_type: 'anomaly',
      query: 'test',
      user_id: 'alice',
      session_id: 'sess-1',
      time_range: '',
      anomalies: [],
      supplier_kpis: [],
      summary: {},
      error: null,
      completed_tasks: [],
      failed_tasks: [],
      created_at: new Date().toISOString(),
      duration_ms: 1500,
      trace_id: 'tr-1',
    })

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      await result.current.handleSend('分析采购订单')
    })

    expect(params.ensureRemoteSession).toHaveBeenCalled()
    expect(mockAnalyzeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '分析采购订单',
        user_id: 'alice',
        session_id: 'sess-1',
      }),
    )
    // setMessages should be called: once for optimistic, once for result
    expect(params.setMessages).toHaveBeenCalled()
  })

  it('handles analyzeQuery error gracefully and pushes a toast', async () => {
    const params = baseParams()
    mockAnalyzeQuery.mockRejectedValue(new Error('服务器内部错误'))

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      await result.current.handleSend('test')
    })

    // setMessages called for optimistic render + error update
    expect(params.setMessages).toHaveBeenCalled()
    const toasts = collectToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('服务器内部错误')
    expect(toasts[0].level).toBe('error')
  })

  it('handles ensureRemoteSession failure', async () => {
    const params = baseParams()
    params.ensureRemoteSession = vi.fn().mockRejectedValue(new Error('创建失败'))

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      await result.current.handleSend('test')
    })

    expect(mockAnalyzeQuery).not.toHaveBeenCalled()
    // setMessages should update placeholder with error
    expect(params.setMessages).toHaveBeenCalled()
  })

  it('shows busy tip and skips send when already loading', async () => {
    const params = baseParams()
    // Simulate a long-running request
    let resolveAnalyze: (v: unknown) => void
    mockAnalyzeQuery.mockImplementation(() => new Promise(r => { resolveAnalyze = r }))

    const { result } = renderHook(() => useMessageSending(params))

    // Start first send (don't await — it stays pending)
    act(() => {
      result.current.handleSend('first')
    })

    // Attempt second send while first is in progress
    await act(async () => {
      await result.current.handleSend('second')
    })

    expect(result.current.busyTip).toBe(true)
    // analyzeQuery should only be called once (for the first send)
    expect(mockAnalyzeQuery).toHaveBeenCalledTimes(1)

    // Clean up: resolve the pending request
    resolveAnalyze!({
      report_id: 'r-1', status: 'success', report_markdown: 'done',
      analysis_type: '', query: '', user_id: '', session_id: '',
      time_range: '', anomalies: [], supplier_kpis: [], summary: {},
      error: null, completed_tasks: [], failed_tasks: [],
      created_at: '', duration_ms: 0,
    })
  })

  it('commitSessionFromAnalyze is called when response includes session', async () => {
    const params = baseParams()
    const apiSession = {
      id: 'sess-1',
      user_id: 'alice',
      title: 'Auto Title',
      title_auto: true,
      message_count: 2,
      last_message_preview: 'report',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    mockAnalyzeQuery.mockResolvedValue({
      report_id: 'r-1',
      status: 'success',
      report_markdown: '# Report',
      analysis_type: '', query: '', user_id: '', session_id: '',
      time_range: '', anomalies: [], supplier_kpis: [], summary: {},
      error: null, completed_tasks: [], failed_tasks: [],
      created_at: '', duration_ms: 0,
      session: apiSession,
    })

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      await result.current.handleSend('test')
    })

    expect(params.commitSessionFromAnalyze).toHaveBeenCalledWith(apiSession)
  })

  it('passes send options (role, outputMode, timeRange) to analyzeQuery', async () => {
    const params = baseParams()
    mockAnalyzeQuery.mockResolvedValue({
      report_id: 'r-1', status: 'success', report_markdown: 'ok',
      analysis_type: '', query: '', user_id: '', session_id: '',
      time_range: '', anomalies: [], supplier_kpis: [], summary: {},
      error: null, completed_tasks: [], failed_tasks: [],
      created_at: '', duration_ms: 0,
    })

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      await result.current.handleSend('test', {
        role: 'procurement',
        outputMode: 'brief',
        timeRange: '30d',
      })
    })

    expect(mockAnalyzeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        analyst_role: 'procurement',
        output_mode: 'brief',
        time_range: '30d',
      }),
    )
  })
})

describe('handleRegenerate', () => {
  it('regenerates an assistant message', async () => {
    const params = baseParams()
    params.messages = [
      { id: 'u-1', role: 'user', content: '原始问题', timestamp: new Date() },
      { id: 'a-1', role: 'assistant', content: '旧回复', timestamp: new Date(), status: 'success' },
    ]

    mockAnalyzeQuery.mockResolvedValue({
      report_id: 'r-2', status: 'success', report_markdown: '新回复',
      analysis_type: '', query: '', user_id: '', session_id: '',
      time_range: '', anomalies: [], supplier_kpis: [], summary: {},
      error: null, completed_tasks: [], failed_tasks: [],
      created_at: '', duration_ms: 500,
    })

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      result.current.handleRegenerate('a-1')
    })

    // Wait for the async IIFE inside handleRegenerate
    await vi.waitFor(() => {
      expect(mockAnalyzeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '原始问题',
          regenerate_of: 'a-1',
        }),
      )
    })
  })

  it('does nothing for invalid assistantMsgId', () => {
    const params = baseParams()
    params.messages = [
      { id: 'u-1', role: 'user', content: 'q', timestamp: new Date() },
    ]

    const { result } = renderHook(() => useMessageSending(params))

    act(() => {
      result.current.handleRegenerate('nonexistent')
    })

    expect(mockAnalyzeQuery).not.toHaveBeenCalled()
  })

  it('does nothing when previous message is not user role', () => {
    const params = baseParams()
    params.messages = [
      { id: 'a-0', role: 'assistant', content: '前一条也是 assistant', timestamp: new Date(), status: 'success' },
      { id: 'a-1', role: 'assistant', content: '要重试的', timestamp: new Date(), status: 'error' },
    ]

    const { result } = renderHook(() => useMessageSending(params))

    act(() => {
      result.current.handleRegenerate('a-1')
    })

    expect(mockAnalyzeQuery).not.toHaveBeenCalled()
  })

  it('handles regenerate error gracefully', async () => {
    const params = baseParams()
    params.messages = [
      { id: 'u-1', role: 'user', content: '问题', timestamp: new Date() },
      { id: 'a-1', role: 'assistant', content: '旧回复', timestamp: new Date(), status: 'error' },
    ]

    mockAnalyzeQuery.mockRejectedValue(new Error('网络错误'))

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      result.current.handleRegenerate('a-1')
    })

    await vi.waitFor(() => {
      expect(mockAnalyzeQuery).toHaveBeenCalled()
    })

    // setMessages should be called with error content
    expect(params.setMessages).toHaveBeenCalled()
  })

  it('handles regenerate ensureRemoteSession failure', async () => {
    const params = baseParams()
    params.messages = [
      { id: 'u-1', role: 'user', content: '问题', timestamp: new Date() },
      { id: 'a-1', role: 'assistant', content: '旧回复', timestamp: new Date(), status: 'error' },
    ]
    params.ensureRemoteSession = vi.fn().mockRejectedValue(new Error('创建失败'))

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      result.current.handleRegenerate('a-1')
    })

    await vi.waitFor(() => {
      expect(params.setMessages).toHaveBeenCalled()
    })

    expect(mockAnalyzeQuery).not.toHaveBeenCalled()
  })

  it('handles regenerate with session ID switch (temp→real)', async () => {
    const params = baseParams()
    params.sessionId = 'temp-123'
    params.ensureRemoteSession = vi.fn().mockResolvedValue('real-456')
    params.messages = [
      { id: 'u-1', role: 'user', content: '问题', timestamp: new Date() },
      { id: 'a-1', role: 'assistant', content: '旧回复', timestamp: new Date(), status: 'error' },
    ]

    mockAnalyzeQuery.mockResolvedValue({
      report_id: 'r-1', status: 'success', report_markdown: '新回复',
      analysis_type: '', query: '', user_id: '', session_id: '',
      time_range: '', anomalies: [], supplier_kpis: [], summary: {},
      error: null, completed_tasks: [], failed_tasks: [],
      created_at: '', duration_ms: 100,
    })

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      result.current.handleRegenerate('a-1')
    })

    await vi.waitFor(() => {
      expect(mockAnalyzeQuery).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: 'real-456' }),
      )
    })
  })
})

describe('handleSend — session ID switch', () => {
  it('switches loading state when ensureRemoteSession returns different ID', async () => {
    const params = baseParams()
    params.sessionId = 'temp-1'
    params.ensureRemoteSession = vi.fn().mockResolvedValue('real-1')

    mockAnalyzeQuery.mockResolvedValue({
      report_id: 'r-1', status: 'success', report_markdown: 'ok',
      analysis_type: '', query: '', user_id: '', session_id: '',
      time_range: '', anomalies: [], supplier_kpis: [], summary: {},
      error: null, completed_tasks: [], failed_tasks: [],
      created_at: '', duration_ms: 0,
    })

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      await result.current.handleSend('test')
    })

    expect(mockAnalyzeQuery).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: 'real-1' }),
    )
  })

  it('handles failed analysis with error status in response', async () => {
    const params = baseParams()
    mockAnalyzeQuery.mockResolvedValue({
      report_id: 'r-1', status: 'error', report_markdown: '',
      analysis_type: '', query: '', user_id: '', session_id: '',
      time_range: '', anomalies: [], supplier_kpis: [], summary: {},
      error: '分析超时', completed_tasks: [], failed_tasks: [],
      created_at: '', duration_ms: 0,
    })

    const { result } = renderHook(() => useMessageSending(params))

    await act(async () => {
      await result.current.handleSend('test')
    })

    // setMessages should be called with error content from response
    expect(params.setMessages).toHaveBeenCalled()
  })
})
