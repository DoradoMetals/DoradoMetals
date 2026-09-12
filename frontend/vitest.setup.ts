if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
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

if (typeof URL.createObjectURL !== 'function') {
  let n = 0
  URL.createObjectURL = () => `blob:vitest-${++n}`
  URL.revokeObjectURL = () => {}
}

const ls = (() => {
  try {
    localStorage.setItem('__probe__', '1')
    localStorage.removeItem('__probe__')
    return null
  } catch {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => void m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size
      },
    }
  }
})()
if (ls) Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
afterEach(cleanup)
