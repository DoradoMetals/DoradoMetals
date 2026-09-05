import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import * as React from 'react'

import { useDragScroll } from './useDragScroll'

function Host({ onChildClick }: { onChildClick: () => void }) {
  const { ref, dragging, handlers } = useDragScroll<HTMLDivElement>()
  return (
    <div>
      <div data-testid="dragging">{String(dragging)}</div>
      <div ref={ref} data-testid="track" {...handlers}>
        <button onClick={onChildClick}>child</button>
      </div>
    </div>
  )
}

describe('useDragScroll', () => {
  it('a mouse drag past the threshold moves scrollLeft and swallows the click that follows', () => {
    const onChildClick = vi.fn()
    const { getByTestId, getByRole } = render(<Host onChildClick={onChildClick} />)
    const track = getByTestId('track') as HTMLDivElement

    fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(track, { pointerId: 1, clientX: 70, pointerType: 'mouse', button: 0 })
    expect(track.scrollLeft).toBe(30)
    expect(getByTestId('dragging').textContent).toBe('true')

    fireEvent.pointerUp(track, { pointerId: 1, clientX: 70, pointerType: 'mouse', button: 0 })
    expect(getByTestId('dragging').textContent).toBe('false')

    fireEvent.click(getByRole('button', { name: 'child' }))
    expect(onChildClick).not.toHaveBeenCalled()
  })

  it('a movement under the threshold is a click, not a drag', () => {
    const onChildClick = vi.fn()
    const { getByTestId, getByRole } = render(<Host onChildClick={onChildClick} />)
    const track = getByTestId('track') as HTMLDivElement

    fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(track, { pointerId: 1, clientX: 98, pointerType: 'mouse', button: 0 })
    expect(getByTestId('dragging').textContent).toBe('false')
    expect(track.scrollLeft).toBe(0)

    fireEvent.pointerUp(track, { pointerId: 1, clientX: 98, pointerType: 'mouse', button: 0 })
    fireEvent.click(getByRole('button', { name: 'child' }))
    expect(onChildClick).toHaveBeenCalledTimes(1)
  })

  it('ignores touch - native scrolling already owns it', () => {
    const { getByTestId } = render(<Host onChildClick={() => {}} />)
    const track = getByTestId('track') as HTMLDivElement

    fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, pointerType: 'touch', button: 0 })
    fireEvent.pointerMove(track, { pointerId: 1, clientX: 20, pointerType: 'touch', button: 0 })
    expect(getByTestId('dragging').textContent).toBe('false')
    expect(track.scrollLeft).toBe(0)
  })

  it('ignores a non-primary mouse button', () => {
    const { getByTestId } = render(<Host onChildClick={() => {}} />)
    const track = getByTestId('track') as HTMLDivElement

    fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, pointerType: 'mouse', button: 2 })
    fireEvent.pointerMove(track, { pointerId: 1, clientX: 20, pointerType: 'mouse', button: 2 })
    expect(getByTestId('dragging').textContent).toBe('false')
    expect(track.scrollLeft).toBe(0)
  })

  it('a second drag after a release is not suppressed by the first', () => {
    const onChildClick = vi.fn()
    const { getByTestId, getByRole } = render(<Host onChildClick={onChildClick} />)
    const track = getByTestId('track') as HTMLDivElement

    fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(track, { pointerId: 1, clientX: 70, pointerType: 'mouse', button: 0 })
    fireEvent.pointerUp(track, { pointerId: 1, clientX: 70, pointerType: 'mouse', button: 0 })
    fireEvent.click(getByRole('button', { name: 'child' }))
    expect(onChildClick).not.toHaveBeenCalled()

    fireEvent.click(getByRole('button', { name: 'child' }))
    expect(onChildClick).toHaveBeenCalledTimes(1)
  })
})
