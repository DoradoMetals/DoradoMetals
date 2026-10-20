'use client'

import * as React from 'react'

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  "input:not([disabled]):not([type='hidden'])",
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  'summary',
  "[tabindex]:not([tabindex^='-'])",
  "[contenteditable]:not([contenteditable='false'])",
].join(',')

function isHidden(el: HTMLElement): boolean {
  if (el.hidden || el.closest('[hidden]') != null) return true
  if (el.getAttribute('aria-hidden') === 'true') return true
  const check = (el as unknown as { checkVisibility?: (o?: unknown) => boolean }).checkVisibility
  if (typeof check === 'function') {
    return !check.call(el, { checkOpacity: false, checkVisibilityCSS: true })
  }
  return false
}

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && !isHidden(el)
  )
}

export type FocusTrapRef<T extends HTMLElement> = React.RefObject<T | null> & {
  onFocusCapture: (event: React.FocusEvent) => void
}

export type FocusTrapOptions = {
  initialFocus?: () => HTMLElement | null
}

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  options: FocusTrapOptions = {}
): FocusTrapRef<T> {
  const initialFocus = React.useRef(options.initialFocus)
  initialFocus.current = options.initialFocus
  const ref = React.useRef<T | null>(null)
  const layered = React.useRef<EventTarget | null>(null)
  const trap = React.useMemo(
    () =>
      Object.assign(ref, {
        onFocusCapture: (event: React.FocusEvent) => {
          layered.current = event.target
        },
      }),
    []
  )

  React.useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root) return

    const restoreTo = document.activeElement as HTMLElement | null

    const chosen = initialFocus.current?.() ?? null
    const first = chosen && root.contains(chosen) ? chosen : (focusable(root)[0] ?? root)
    if (!root.hasAttribute('tabindex') && first === root) root.setAttribute('tabindex', '-1')
    first.focus({ preventScroll: true })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusable(root)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const current = document.activeElement as HTMLElement | null

      if (!e.shiftKey && current === lastItem) {
        e.preventDefault()
        firstItem.focus({ preventScroll: true })
      } else if (e.shiftKey && (current === firstItem || current === root)) {
        e.preventDefault()
        lastItem.focus({ preventScroll: true })
      }
    }

    const onFocusIn = (e: FocusEvent) => {
      const owned = layered.current === e.target
      layered.current = null
      if (owned || root.contains(e.target as Node)) return
      const items = focusable(root)
      ;(items[0] ?? root).focus({ preventScroll: true })
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus({ preventScroll: true })
    }
  }, [active])

  return trap
}
