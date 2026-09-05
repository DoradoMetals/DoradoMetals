// Gap-fills for jsdom, loaded before every test file. jsdom implements the
// DOM, not the whole browser platform; the pieces Radix and the components
// need that it lacks are shimmed HERE, once.

// floating-ui (under Radix popovers/menus/selects) measures with these.
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
// Radix Select/Menu scroll the highlighted option into view on open.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}
// Radix presses use pointer capture; jsdom has no pointer events at all.
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
// File previews (Upload/Attachment) object-URL their thumbnails.
if (typeof URL.createObjectURL !== 'function') {
  let n = 0
  URL.createObjectURL = () => `blob:vitest-${++n}`
  URL.revokeObjectURL = () => {}
}

// testing-library's auto-cleanup registers only when `afterEach` is a global,
// and globals are off - without this the second test finds the first test's
// buttons still mounted.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
afterEach(cleanup)

// chart.js needs a 2d context; jsdom has none. A call-absorbing stub is
// enough for smoke tests - geometry is not asserted, aria is.
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.getContext) {
  // @ts-expect-error - jsdom's canvas has no getContext at all
  HTMLCanvasElement.prototype.getContext = () => null
}
if (typeof HTMLCanvasElement !== 'undefined') {
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (kind: string, ...rest: unknown[]) {
    const real = orig?.call(this, kind as never, ...(rest as never[]))
    if (real) return real
    if (kind !== '2d') return null
    const absorb: ProxyHandler<Record<string, unknown>> = {
      get: (t, prop) => {
        if (prop === 'canvas') return this
        if (prop === 'measureText') return () => ({ width: 0 })
        if (prop === 'getContextAttributes') return () => ({})
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient')
          return () => new Proxy({}, absorb)
        if (typeof prop === 'string' && !(prop in t)) return () => undefined
        return t[prop as string]
      },
      set: () => true,
    }
    return new Proxy({}, absorb) as unknown as CanvasRenderingContext2D
  } as typeof HTMLCanvasElement.prototype.getContext
}
