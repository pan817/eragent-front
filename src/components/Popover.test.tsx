import { render, screen, fireEvent, act } from '@testing-library/react'
import { useRef, useState } from 'react'
import Popover from './Popover'

function Harness({
  initialOpen = false,
  placement,
}: {
  initialOpen?: boolean
  placement?: 'bottom-start' | 'bottom-end'
}) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(initialOpen)
  return (
    <div>
      <button ref={anchorRef} onClick={() => setOpen(true)} data-testid="anchor">
        anchor
      </button>
      <button data-testid="outside">outside</button>
      <Popover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        placement={placement}
      >
        <div data-testid="popover-body">popover content</div>
      </Popover>
    </div>
  )
}

describe('Popover', () => {
  it('renders nothing when closed', () => {
    render(<Harness />)
    expect(screen.queryByTestId('popover-body')).not.toBeInTheDocument()
  })

  it('renders into portal when open', () => {
    render(<Harness initialOpen />)
    const body = screen.getByTestId('popover-body')
    expect(body).toBeInTheDocument()
    // Portal should attach to document.body, not inside the harness div
    expect(body.parentElement?.parentElement).toBe(document.body)
  })

  it('closes on Escape', () => {
    render(<Harness initialOpen />)
    expect(screen.getByTestId('popover-body')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByTestId('popover-body')).not.toBeInTheDocument()
  })

  it('closes on outside mousedown', () => {
    render(<Harness initialOpen />)
    expect(screen.getByTestId('popover-body')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByTestId('popover-body')).not.toBeInTheDocument()
  })

  it('does not close when clicking inside popover', () => {
    render(<Harness initialOpen />)
    fireEvent.mouseDown(screen.getByTestId('popover-body'))
    expect(screen.getByTestId('popover-body')).toBeInTheDocument()
  })

  it('does not close when clicking anchor itself', () => {
    render(<Harness initialOpen />)
    fireEvent.mouseDown(screen.getByTestId('anchor'))
    expect(screen.getByTestId('popover-body')).toBeInTheDocument()
  })

  it('applies position:fixed styling', () => {
    render(<Harness initialOpen />)
    const host = screen.getByTestId('popover-body').parentElement as HTMLElement
    expect(host.style.position).toBe('fixed')
    expect(host.style.zIndex).toBe('2000')
  })

  it('uses right-anchored positioning for bottom-end', () => {
    render(<Harness initialOpen placement="bottom-end" />)
    const host = screen.getByTestId('popover-body').parentElement as HTMLElement
    expect(host.style.position).toBe('fixed')
    // bottom-end 应设置 right 而非 left
    expect(host.style.right).not.toBe('')
  })
})
