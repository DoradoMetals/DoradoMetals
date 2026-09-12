import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import * as React from 'react'
import { useBreakpoint, useMediaUp, useMounted } from './useBreakpoint'
import { BREAKPOINTS, BREAKPOINT_ORDER, breakpointPx, resetBreakpointCache } from './breakpoints'

type Listener = () => void
const listeners = new Map<string, Set<Listener>>()
let width = 1440

function install() {
  window.matchMedia = ((q: string) => {
    const min = Number(/\(min-width: (\d+)px\)/.exec(q)?.[1] ?? 0)
    return {
      media: q,
      get matches() {
        return width >= min
      },
      addEventListener: (_: string, fn: Listener) => {
        if (!listeners.has(q)) listeners.set(q, new Set())
        listeners.get(q)!.add(fn)
      },
      removeEventListener: (_: string, fn: Listener) => listeners.get(q)?.delete(fn),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia
}

function resize(next: number) {
  width = next
  act(() => {
    for (const set of listeners.values()) for (const fn of set) fn()
  })
}

function Probe() {
  const { breakpoint, mounted, isAbove, isBelow } = useBreakpoint()
  return <output>{`${breakpoint}|${mounted}|${isAbove('lg')}|${isBelow('md')}`}</output>
}

describe('useBreakpoint', () => {
  beforeEach(() => {
    listeners.clear()
    width = 1440
    install()
    document.documentElement.removeAttribute('style')
    resetBreakpointCache()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('style')
    resetBreakpointCache()
  })

  it('every step is a whole number of rem', () => {
    for (const px of Object.values(BREAKPOINTS)) expect(px % 16).toBe(0)
  })

  it('the order is ascending and complete', () => {
    expect([...BREAKPOINT_ORDER]).toEqual(Object.keys(BREAKPOINTS))
    const values = BREAKPOINT_ORDER.map((b) => BREAKPOINTS[b])
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })

  it('server-renders as the smallest breakpoint, so hydration cannot mismatch', () => {
    const original = window.matchMedia
    // @ts-expect-error - proving the server snapshot never touches matchMedia
    delete window.matchMedia
    const html = renderToString(<Probe />)
    window.matchMedia = original
    expect(html).toContain('xs|false|false|true')
  })

  it('resolves the current breakpoint after mount', () => {
    const { container } = render(<Probe />)
    expect(container.textContent).toBe('xl|true|true|false')
  })

  it('follows a resize without a remount', () => {
    const { container } = render(<Probe />)
    resize(390)
    expect(container.textContent).toBe('xs|true|false|true')
    resize(800)
    expect(container.textContent).toBe('md|true|false|false')
    resize(1024)
    expect(container.textContent).toBe('lg|true|true|false')
  })

  it('useMediaUp answers one query', () => {
    function One() {
      return <output>{String(useMediaUp('md'))}</output>
    }
    const { container } = render(<One />)
    expect(container.textContent).toBe('true')
    resize(500)
    expect(container.textContent).toBe('false')
  })

  it('useMounted is false on the server and true after mount', () => {
    function M() {
      return <output>{String(useMounted())}</output>
    }
    expect(renderToString(<M />)).toContain('false')
    const { container } = render(<M />)
    expect(container.textContent).toBe('true')
  })

  describe('the threshold comes from the theme token', () => {
    it('falls back to the compiled scale when the stylesheet declares nothing', () => {
      expect(breakpointPx('md')).toBe(BREAKPOINTS.md)
    })

    it('does not cache a read that resolved nothing', () => {
      expect(breakpointPx('lg')).toBe(BREAKPOINTS.lg)
      document.documentElement.style.setProperty('--breakpoint-lg', '50rem')
      expect(breakpointPx('lg')).toBe(800)
    })

    it('reads rem and px, and falls back per step', () => {
      document.documentElement.style.setProperty('--breakpoint-md', '50rem')
      document.documentElement.style.setProperty('--breakpoint-lg', '900px')
      expect(breakpointPx('md')).toBe(800)
      expect(breakpointPx('lg')).toBe(900)
      expect(breakpointPx('xl')).toBe(BREAKPOINTS.xl)
    })

    it('the hook queries the theme value, not the constant', () => {
      document.documentElement.style.setProperty('--breakpoint-lg', '1200px')
      function One() {
        return <output>{String(useMediaUp('lg'))}</output>
      }
      const { container } = render(<One />)
      expect(container.textContent).toBe('true')
      resize(1100)
      expect(container.textContent).toBe('false')
    })
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<Probe />)
    expect([...listeners.values()].some((s) => s.size > 0)).toBe(true)
    unmount()
    expect([...listeners.values()].every((s) => s.size === 0)).toBe(true)
  })
})
