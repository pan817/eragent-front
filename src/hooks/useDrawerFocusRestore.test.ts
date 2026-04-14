import { renderHook, act } from '@testing-library/react'
import { useRef, type MutableRefObject } from 'react'
import { useDrawerFocusRestore } from './useDrawerFocusRestore'

function flushRaf() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

describe('useDrawerFocusRestore', () => {
  let rowRefs: MutableRefObject<Map<string, HTMLElement>>

  beforeEach(() => {
    document.body.innerHTML = ''
    const map = new Map<string, HTMLElement>()
    rowRefs = { current: map }
  })

  it('restores focus to captured activeElement after activeId clears', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    // Start with no active drawer
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useDrawerFocusRestore(id, rowRefs),
      { initialProps: { id: null as string | null } },
    )

    // Open the drawer: capture current focus, then transition activeId
    act(() => {
      result.current.capture('span-1')
    })
    rerender({ id: 'span-1' })

    // Simulate drawer taking focus elsewhere
    const drawerBtn = document.createElement('button')
    document.body.appendChild(drawerBtn)
    drawerBtn.focus()
    expect(document.activeElement).toBe(drawerBtn)

    // Close the drawer
    rerender({ id: null })
    await act(async () => {
      await flushRaf()
    })

    expect(document.activeElement).toBe(trigger)
  })

  it('falls back to rowRefs element when captured focus is gone from DOM', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const row = document.createElement('div')
    row.tabIndex = 0
    document.body.appendChild(row)
    rowRefs.current.set('span-2', row)

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useDrawerFocusRestore(id, rowRefs),
      { initialProps: { id: null as string | null } },
    )

    act(() => {
      result.current.capture('span-2')
    })
    rerender({ id: 'span-2' })

    // 触发元素从 DOM 移除（如用户期间切换了数据）
    document.body.removeChild(trigger)

    rerender({ id: null })
    await act(async () => {
      await flushRaf()
    })

    expect(document.activeElement).toBe(row)
  })

  it('does nothing if drawer never opened', async () => {
    const other = document.createElement('button')
    document.body.appendChild(other)
    other.focus()

    renderHook(() => useDrawerFocusRestore(null, rowRefs))
    await act(async () => {
      await flushRaf()
    })
    // 未 capture 过，activeElement 保持不变
    expect(document.activeElement).toBe(other)
  })

  it('does not restore focus while drawer is still open', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useDrawerFocusRestore(id, rowRefs),
      { initialProps: { id: null as string | null } },
    )

    act(() => {
      result.current.capture('span-3')
    })
    rerender({ id: 'span-3' })

    const other = document.createElement('button')
    document.body.appendChild(other)
    other.focus()

    // 仍处于打开态，rerender 同样 activeId 不应触发回迁
    rerender({ id: 'span-3' })
    await act(async () => {
      await flushRaf()
    })

    expect(document.activeElement).toBe(other)
  })
})
