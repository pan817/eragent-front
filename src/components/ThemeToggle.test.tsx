import { render, screen, fireEvent } from '@testing-library/react'

// Must mock localStorage before ThemeToggle imports
const store: Record<string, string> = {}
const mockGetItem = vi.fn((key: string) => store[key] ?? null)
const mockSetItem = vi.fn((key: string, val: string) => { store[key] = val })

Object.defineProperty(window, 'localStorage', {
  value: { getItem: mockGetItem, setItem: mockSetItem, removeItem: vi.fn() },
  writable: true,
})

import ThemeToggle from './ThemeToggle'

beforeEach(() => {
  delete store['theme']
  mockGetItem.mockClear()
  mockSetItem.mockClear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeToggle', () => {
  it('renders toggle button', () => {
    render(<ThemeToggle />)
    expect(screen.getByLabelText('切换主题')).toBeInTheDocument()
  })

  it('defaults to light theme', () => {
    render(<ThemeToggle />)
    expect(screen.getByTitle('切换到深色模式')).toBeInTheDocument()
  })

  it('toggles to dark on click', () => {
    render(<ThemeToggle />)

    fireEvent.click(screen.getByLabelText('切换主题'))

    expect(screen.getByTitle('切换到浅色模式')).toBeInTheDocument()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorageMock['theme']).toBe('dark')
  })

  it('toggles back to light on second click', () => {
    render(<ThemeToggle />)

    fireEvent.click(screen.getByLabelText('切换主题'))
    fireEvent.click(screen.getByLabelText('切换主题'))

    expect(screen.getByTitle('切换到深色模式')).toBeInTheDocument()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('restores saved dark theme from localStorage', () => {
    store['theme'] = 'dark'
    render(<ThemeToggle />)

    expect(screen.getByTitle('切换到浅色模式')).toBeInTheDocument()
  })

  it('restores saved light theme from localStorage', () => {
    store['theme'] = 'light'
    render(<ThemeToggle />)

    expect(screen.getByTitle('切换到深色模式')).toBeInTheDocument()
  })
})
