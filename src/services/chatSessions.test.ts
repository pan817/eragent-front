import {
  listSessions,
  createSession,
  getSession,
  updateSessionTitle,
  deleteSession,
  clearAllSessions,
  appendMessages,
  updateMessage,
  searchSessions,
} from './chatSessions'
import { ApiError } from '../types/api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(() => {
  mockFetch.mockReset()
})

/** Helper: mock a successful JSON response */
function mockOk(data: unknown, status = 200) {
  mockFetch.mockResolvedValue({
    ok: true,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
  })
}

/** Helper: mock a 204 No Content response */
function mock204() {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  })
}

/** Helper: mock an error response */
function mockError(status: number, body?: { error: { code: string; message: string } }) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body ? JSON.stringify(body) : ''),
  })
}

const USER = 'alice'

describe('listSessions', () => {
  it('sends GET with X-User-Id header', async () => {
    mockOk({ sessions: [], next_cursor: null })
    await listSessions(USER)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sessions'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-User-Id': USER }),
      }),
    )
  })

  it('passes limit and cursor as query params', async () => {
    mockOk({ sessions: [], next_cursor: null })
    await listSessions(USER, { limit: 10, cursor: 'abc' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('limit=10')
    expect(url).toContain('cursor=abc')
  })
})

describe('createSession', () => {
  it('sends POST with title in body', async () => {
    const session = { id: 's-1', title: 'Test', user_id: USER }
    mockOk({ session })
    await createSession(USER, { title: 'Test' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sessions'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Test' }),
      }),
    )
  })

  it('includes Idempotency-Key header when provided', async () => {
    mockOk({ session: {} })
    await createSession(USER, { idempotencyKey: 'key-123' })

    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBe('key-123')
  })
})

describe('getSession', () => {
  it('fetches session detail with message_limit', async () => {
    mockOk({ session: {}, messages: [], has_more_messages: false })
    await getSession(USER, 's-1', { messageLimit: 50 })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/sessions/s-1')
    expect(url).toContain('message_limit=50')
  })
})

describe('updateSessionTitle', () => {
  it('sends PATCH with title', async () => {
    mockOk({ session: { id: 's-1', title: 'New' } })
    await updateSessionTitle(USER, 's-1', 'New')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sessions/s-1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'New' }),
      }),
    )
  })
})

describe('deleteSession', () => {
  it('sends DELETE and handles 204', async () => {
    mock204()
    await expect(deleteSession(USER, 's-1')).resolves.toBeUndefined()

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sessions/s-1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('clearAllSessions', () => {
  it('sends DELETE with confirm=DELETE_ALL', async () => {
    mockOk({ deleted_count: 5 })
    const result = await clearAllSessions(USER)

    expect(result).toEqual({ deleted_count: 5 })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('confirm=DELETE_ALL')
  })
})

describe('appendMessages', () => {
  it('sends POST with messages array', async () => {
    const msgs = [{ role: 'user' as const, content: 'hello' }]
    mockOk({ messages: [], session: {} })
    await appendMessages(USER, 's-1', msgs)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sessions/s-1/messages'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messages: msgs }),
      }),
    )
  })
})

describe('updateMessage', () => {
  it('sends PATCH to message endpoint', async () => {
    mockOk({ message: { id: 'm-1' } })
    await updateMessage(USER, 's-1', 'm-1', { content: 'updated' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/sessions/s-1/messages/m-1')
    expect(mockFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ content: 'updated' }),
      }),
    )
  })
})

describe('searchSessions', () => {
  it('sends GET with query params', async () => {
    mockOk({ sessions: [] })
    await searchSessions(USER, '采购', { limit: 5, scope: 'all' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/sessions/search')
    expect(url).toContain('q=%E9%87%87%E8%B4%AD')
    expect(url).toContain('limit=5')
    expect(url).toContain('scope=all')
  })
})

describe('apiFetch error handling', () => {
  it('throws ApiError with parsed error body', async () => {
    mockError(422, {
      error: { code: 'VALIDATION_ERROR', message: 'invalid field' },
    })

    await expect(listSessions(USER)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'invalid field',
    })
  })

  it('throws NETWORK_ERROR on fetch rejection', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(listSessions(USER)).rejects.toBeInstanceOf(ApiError)
    await expect(listSessions(USER)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('throws INVALID_RESPONSE for non-JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('<html>Bad Gateway</html>'),
    })

    await expect(listSessions(USER)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
