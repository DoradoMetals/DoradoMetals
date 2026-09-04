import { describe, expect, it } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import * as React from 'react'

import { useFocusTrap } from './useFocusTrap'

function Trapped({ active }: { active: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>(active)
  return (
    <>
      <button>outside before</button>
      <div ref={ref}>
        <button>first</button>
        <button>middle</button>
        <button>last</button>
      </div>
      <button>outside after</button>
    </>
  )
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element when it activates', () => {
    const { getByText } = render(<Trapped active />)
    expect(document.activeElement).toBe(getByText('first'))
  })

  it('does nothing at all when inactive', () => {
    render(<Trapped active={false} />)
    expect(document.activeElement).toBe(document.body)
  })

  it('Tab off the last element wraps to the first', () => {
    const { getByText } = render(<Trapped active />)
    getByText('last').focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(getByText('first'))
  })

  it('Shift+Tab off the first element wraps to the last', () => {
    const { getByText } = render(<Trapped active />)
    getByText('first').focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(getByText('last'))
  })

  it('focus escaping to the outside is pulled back in', () => {
    const { getByText } = render(<Trapped active />)
    fireEvent.focusIn(getByText('outside after'), { target: getByText('outside after') })
    expect(document.activeElement).toBe(getByText('first'))
  })

  it('restores focus to whatever was focused before, on release', () => {
    const { getByText, rerender } = render(<Trapped active={false} />)
    const before = getByText('outside before')
    before.focus()
    rerender(<Trapped active />)
    expect(document.activeElement).toBe(getByText('first'))
    rerender(<Trapped active={false} />)
    expect(document.activeElement).toBe(before)
  })
})
