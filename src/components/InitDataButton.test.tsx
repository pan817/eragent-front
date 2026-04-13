import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InitDataButton from './InitDataButton'

vi.mock('../services/api', () => ({
  initData: vi.fn(),
}))

import { initData } from '../services/api'

const mockInitData = vi.mocked(initData)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InitDataButton', () => {
  it('renders the button with label', () => {
    render(<InitDataButton />)
    expect(screen.getByText('重置数据')).toBeInTheDocument()
  })

  it('opens confirm dialog on click', () => {
    render(<InitDataButton />)

    fireEvent.click(screen.getByText('重置数据'))

    expect(screen.getByText('确认重置模拟数据？')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/输入 "重置" 确认/)).toBeInTheDocument()
  })

  it('confirm button is disabled until keyword is typed', async () => {
    render(<InitDataButton />)
    fireEvent.click(screen.getByText('重置数据'))

    expect(screen.getByText('确认重置')).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText(/输入 "重置" 确认/), '重置')

    expect(screen.getByText('确认重置')).not.toBeDisabled()
  })

  it('closes confirm dialog on cancel', () => {
    render(<InitDataButton />)
    fireEvent.click(screen.getByText('重置数据'))
    expect(screen.getByText('确认重置模拟数据？')).toBeInTheDocument()

    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByText('确认重置模拟数据？')).not.toBeInTheDocument()
  })

  it('closes confirm dialog on Escape', async () => {
    render(<InitDataButton />)
    fireEvent.click(screen.getByText('重置数据'))

    const input = screen.getByPlaceholderText(/输入 "重置" 确认/)
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByText('确认重置模拟数据？')).not.toBeInTheDocument()
  })

  it('calls initData and shows success toast', async () => {
    mockInitData.mockResolvedValue({
      status: 'ok',
      message: '成功生成 500 条记录',
      seed: 42,
      tables: { po_headers: 100, po_lines: 200 },
    })

    render(<InitDataButton />)

    // Open confirm dialog
    fireEvent.click(screen.getByText('重置数据'))
    await userEvent.type(screen.getByPlaceholderText(/输入 "重置" 确认/), '重置')

    // Click confirm
    await act(async () => {
      fireEvent.click(screen.getByText('确认重置'))
    })

    expect(mockInitData).toHaveBeenCalled()
    expect(screen.getByText('成功构造新数据')).toBeInTheDocument()
    expect(screen.getByText('成功生成 500 条记录')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('PO 头')).toBeInTheDocument()
    expect(screen.getByText('PO 行')).toBeInTheDocument()
  })

  it('shows error toast on failure', async () => {
    mockInitData.mockRejectedValue(new Error('网络错误'))

    render(<InitDataButton />)

    fireEvent.click(screen.getByText('重置数据'))
    await userEvent.type(screen.getByPlaceholderText(/输入 "重置" 确认/), '重置')

    await act(async () => {
      fireEvent.click(screen.getByText('确认重置'))
    })

    expect(screen.getByText('操作失败')).toBeInTheDocument()
    expect(screen.getByText('网络错误')).toBeInTheDocument()
  })

  it('shows loading state during request', async () => {
    let resolveInit: (v: unknown) => void
    mockInitData.mockImplementation(() => new Promise(r => { resolveInit = r }))

    render(<InitDataButton />)

    fireEvent.click(screen.getByText('重置数据'))
    await userEvent.type(screen.getByPlaceholderText(/输入 "重置" 确认/), '重置')

    act(() => {
      fireEvent.click(screen.getByText('确认重置'))
    })

    expect(screen.getByText('生成中...')).toBeInTheDocument()

    // Clean up
    await act(async () => {
      resolveInit!({ status: 'ok', message: 'done', seed: 1, tables: {} })
    })
  })

  it('can dismiss success toast', async () => {
    mockInitData.mockResolvedValue({
      status: 'ok',
      message: 'done',
      seed: 1,
      tables: {},
    })

    render(<InitDataButton />)
    fireEvent.click(screen.getByText('重置数据'))
    await userEvent.type(screen.getByPlaceholderText(/输入 "重置" 确认/), '重置')
    await act(async () => {
      fireEvent.click(screen.getByText('确认重置'))
    })

    expect(screen.getByText('成功构造新数据')).toBeInTheDocument()

    // Close toast
    const closeBtn = screen.getByRole('status').querySelector('[aria-label="关闭"]')!
    fireEvent.click(closeBtn)

    expect(screen.queryByText('成功构造新数据')).not.toBeInTheDocument()
  })

  it('can dismiss error toast', async () => {
    mockInitData.mockRejectedValue(new Error('fail'))

    render(<InitDataButton />)
    fireEvent.click(screen.getByText('重置数据'))
    await userEvent.type(screen.getByPlaceholderText(/输入 "重置" 确认/), '重置')
    await act(async () => {
      fireEvent.click(screen.getByText('确认重置'))
    })

    const closeBtn = screen.getByRole('alert').querySelector('[aria-label="关闭"]')!
    fireEvent.click(closeBtn)

    expect(screen.queryByText('操作失败')).not.toBeInTheDocument()
  })

  it('submits on Enter key in confirm input', async () => {
    mockInitData.mockResolvedValue({
      status: 'ok', message: 'done', seed: 1, tables: {},
    })

    render(<InitDataButton />)
    fireEvent.click(screen.getByText('重置数据'))

    const input = screen.getByPlaceholderText(/输入 "重置" 确认/)
    await userEvent.type(input, '重置')

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    expect(mockInitData).toHaveBeenCalled()
  })

  it('closes on overlay click', () => {
    render(<InitDataButton />)
    fireEvent.click(screen.getByText('重置数据'))

    const overlay = document.querySelector('.modal-overlay')!
    fireEvent.click(overlay)

    expect(screen.queryByText('确认重置模拟数据？')).not.toBeInTheDocument()
  })
})
