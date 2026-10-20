import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import * as React from 'react'

import { BREAKPOINTS, breakpointPx, resetBreakpointCache } from './breakpoints'
import { rovingKeyDown } from './roving'
import { useDebounce } from './useDebounce'
import { useDragScroll } from './useDragScroll'
import { useFocusTrap } from './useFocusTrap'
import { setup, useUserFakeTimers } from '../test/render'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetBreakpointCache()
})

describe('useDebounce', () => {
  function Echo({ value, delay }: { value: string; delay?: number }) {
    return <p>{useDebounce(value, delay)}</p>
  }

  it('settles to the last value after the delay and drops the ones in between', () => {
    useUserFakeTimers()
    const { container, rerender } = render(<Echo value="a" delay={200} />)
    rerender(<Echo value="b" delay={200} />)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender(<Echo value="c" delay={200} />)
    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(container.textContent).toBe('a')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(container.textContent).toBe('c')
  })

  it('unmounting before the delay clears the timer', () => {
    useUserFakeTimers()
    const cleared = vi.spyOn(globalThis, 'clearTimeout')
    const { rerender, unmount } = render(<Echo value="a" />)
    rerender(<Echo value="b" />)
    unmount()
    expect(cleared).toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
  })
})

describe('breakpointPx', () => {
  it('falls back to the static table when getComputedStyle is missing', () => {
    vi.stubGlobal('getComputedStyle', undefined)
    expect(breakpointPx('md')).toBe(BREAKPOINTS.md)
  })
})

describe('rovingKeyDown', () => {
  function Group({ wrap }: { wrap?: boolean }) {
    return (
      <div
        role="toolbar"
        aria-label="Tools"
        onKeyDown={rovingKeyDown('button', { orientation: 'horizontal', wrap })}
      >
        <button type="button">A</button>
        <button type="button" disabled>
          B
        </button>
        <button type="button" aria-disabled="true">
          C
        </button>
        <button type="button">D</button>
      </div>
    )
  }

  it('skips disabled items, wraps when asked, and ignores other keys', async () => {
    const { user, getByRole } = setup(<Group wrap />)
    getByRole('button', { name: 'A' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(getByRole('button', { name: 'D' }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(getByRole('button', { name: 'A' }))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(getByRole('button', { name: 'D' }))
    await user.keyboard('{ArrowDown}x')
    expect(document.activeElement).toBe(getByRole('button', { name: 'D' }))
  })

  it('without wrap stops at the ends', async () => {
    const { user, getByRole } = setup(<Group />)
    getByRole('button', { name: 'D' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(getByRole('button', { name: 'D' }))
    await user.keyboard('{Home}{ArrowLeft}')
    expect(document.activeElement).toBe(getByRole('button', { name: 'A' }))
  })
})

describe('useDragScroll pointer capture', () => {
  function Host() {
    const { ref, handlers } = useDragScroll<HTMLDivElement>()
    return <div ref={ref} data-testid="track" {...handlers} />
  }

  it('ignores touch and right-button presses, and moves or releases with no press', async () => {
    const { user, getByTestId } = setup(<Host />)
    const track = getByTestId('track')
    await user.pointer([
      { keys: '[TouchA>]', target: track, coords: { clientX: 100 } },
      { pointerName: 'TouchA', target: track, coords: { clientX: 40 } },
      { keys: '[/TouchA]', target: track },
      { keys: '[MouseRight>]', target: track, coords: { clientX: 100 } },
      { target: track, coords: { clientX: 40 } },
      { keys: '[/MouseRight]', target: track },
      { target: track, coords: { clientX: 10 } },
    ])
    expect(track.scrollLeft).toBe(0)
  })

  it('releases a held pointer capture when the drag ends', async () => {
    vi.spyOn(Element.prototype, 'hasPointerCapture').mockReturnValue(true)
    const release = vi.spyOn(Element.prototype, 'releasePointerCapture')
    const { user, getByTestId } = setup(<Host />)
    const track = getByTestId('track')
    await user.pointer([
      { keys: '[MouseLeft>]', target: track, coords: { clientX: 100 } },
      { target: track, coords: { clientX: 60 } },
      { keys: '[/MouseLeft]', target: track, coords: { clientX: 60 } },
    ])
    expect(release).toHaveBeenCalled()
  })
})

describe('useFocusTrap edges', () => {
  function Trap({ children }: { children?: React.ReactNode }) {
    const ref = useFocusTrap<HTMLDivElement>(true)
    return (
      <div ref={ref} data-testid="trap">
        {children}
      </div>
    )
  }

  it('with nothing focusable, the panel takes focus and Tab stays put', async () => {
    const { user, getByTestId } = setup(<Trap>text only</Trap>)
    expect(document.activeElement).toBe(getByTestId('trap'))
    await user.tab()
    expect(document.activeElement).toBe(getByTestId('trap'))
  })

  it('uses checkVisibility where the platform has it to skip hidden controls', async () => {
    const proto = Element.prototype as unknown as { checkVisibility?: () => boolean }
    proto.checkVisibility = function (this: Element) {
      return this.textContent !== 'Hidden'
    }
    try {
      const { user, getByRole } = setup(
        <Trap>
          <button type="button">First</button>
          <button type="button">Last</button>
          <button type="button">Hidden</button>
        </Trap>
      )
      expect(document.activeElement).toBe(getByRole('button', { name: 'First' }))
      getByRole('button', { name: 'Last' }).focus()
      await user.tab()
      expect(document.activeElement).toBe(getByRole('button', { name: 'First' }))
    } finally {
      delete proto.checkVisibility
    }
  })
})
