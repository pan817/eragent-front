import { analyzeQuery, initData, getTrace } from './api'
import { ApiError } from '../types/api'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(() => {
  mockFetch.mockReset()
})

describe('analyzeQuery', () => {
  const request = {
    query: '分析采购订单',
    user_id: 'alice',
    session_id: 'sess-1',
  }

  it('sends POST request with correct body and returns data', async () => {
    const mockResponse = { report_id: 'r-1', status: 'success' }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await analyzeQuery(request)
    expect(result).toEqual(mockResponse)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/analyze'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }),
    )
  })

  it('throws ApiError with NETWORK_ERROR on fetch failure', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(analyzeQuery(request)).rejects.toThrow(ApiError)
    await expect(analyzeQuery(request)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    })
  })

  it('throws ApiError with HTTP status on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(analyzeQuery(request)).rejects.toThrow(ApiError)
    await expect(analyzeQuery(request)).rejects.toMatchObject({
      code: 'HTTP_500',
      status: 500,
    })
  })
})

describe('initData', () => {
  it('sends POST and returns data', async () => {
    const mockResponse = { status: 'ok', message: 'done', seed: 42, tables: {} }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await initData()
    expect(result).toEqual(mockResponse)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/init-data'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws NETWORK_ERROR on failure', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    await expect(initData()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})

describe('getTrace', () => {
  it('fetches trace by ID', async () => {
    const mockTrace = { trace_id: 'tr-1', spans: [] }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTrace),
    })

    const result = await getTrace('tr-1')
    expect(result).toEqual(mockTrace)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/traces/tr-1'),
    )
  })

  it('throws on 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })
    await expect(getTrace('missing')).rejects.toMatchObject({
      status: 404,
    })
  })
})
