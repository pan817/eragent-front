import { render, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'

function TrapContainer({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, active)

  return (
    <div ref={ref} data-testid="trap">
      <button data-testid="first">First</button>
      <input data-testid="middle" />
      <button data-testid="last">Last</button>
    </div>
  )
}

function EmptyTrapContainer({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, active)

  return <div ref={ref} data-testid="trap"><span>no focusable</span></div>
}

describe('useFocusTrap', () => {
  it('focuses first focusable element when activated', () => {
    render(<TrapContainer active={true} />)
    expect(document.activeElement?.getAttribute('data-testid')).toBe('first')
  })

  it('does not trap focus when inactive', () => {
    render(<TrapContainer active={false} />)
    expect(document.activeElement?.getAttribute('data-testid')).not.toBe('first')
  })

  it('wraps focus from last to first on Tab', () => {
    render(<TrapContainer active={true} />)

    // Focus the last element
    const last = document.querySelector('[data-testid="last"]') as HTMLElement
    last.focus()
    expect(document.activeElement).toBe(last)

    // Press Tab — should wrap to first
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement?.getAttribute('data-testid')).toBe('first')
  })

  it('wraps focus from first to last on Shift+Tab', () => {
    render(<TrapContainer active={true} />)

    // Focus is on first after mount
    const first = document.querySelector('[data-testid="first"]') as HTMLElement
    expect(document.activeElement).toBe(first)

    // Press Shift+Tab — should wrap to last
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement?.getAttribute('data-testid')).toBe('last')
  })

  it('does nothing for non-Tab keys', () => {
    render(<TrapContainer active={true} />)

    const first = document.querySelector('[data-testid="first"]') as HTMLElement
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(document.activeElement).toBe(first)
  })

  it('handles container with no focusable elements', () => {
    render(<EmptyTrapContainer active={true} />)
    // Should not crash
    fireEvent.keyDown(document, { key: 'Tab' })
  })

  it('restores focus to previous element on deactivate', () => {
    // Create an external button to hold focus before trap activates
    const outer = document.createElement('button')
    outer.setAttribute('data-testid', 'outer')
    document.body.appendChild(outer)
    outer.focus()
    expect(document.activeElement).toBe(outer)

    const { rerender } = render(<TrapContainer active={true} />)

    // Focus moved into trap
    expect(document.activeElement?.getAttribute('data-testid')).toBe('first')

    // Deactivate
    rerender(<TrapContainer active={false} />)

    // Focus should be restored to outer
    expect(document.activeElement).toBe(outer)

    document.body.removeChild(outer)
  })
})
