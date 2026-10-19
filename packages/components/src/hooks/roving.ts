import type * as React from 'react'

export type RovingOptions = {
  select?: boolean
  orientation?: 'horizontal' | 'vertical' | 'both'
  wrap?: boolean
}

const NEXT = {
  horizontal: ['ArrowRight'],
  vertical: ['ArrowDown'],
  both: ['ArrowRight', 'ArrowDown'],
}
const PREV = { horizontal: ['ArrowLeft'], vertical: ['ArrowUp'], both: ['ArrowLeft', 'ArrowUp'] }

export function rovingKeyDown(selector: string, options: RovingOptions = {}) {
  const { select = false, orientation = 'both', wrap = false } = options
  return (event: React.KeyboardEvent<HTMLElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'
    )
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (index === -1 || items.length === 0) return
    const last = items.length - 1
    let next: number
    if (NEXT[orientation].includes(event.key)) next = index === last ? (wrap ? 0 : last) : index + 1
    else if (PREV[orientation].includes(event.key))
      next = index === 0 ? (wrap ? last : 0) : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else return
    event.preventDefault()
    const target = items[next]!
    target.focus()
    if (select && target !== items[index]) target.click()
  }
}

export function rovingIndex<T>(
  items: T[],
  isSelected: (item: T) => boolean,
  isEnabled: (item: T) => boolean
): number {
  const selected = items.findIndex((item) => isSelected(item) && isEnabled(item))
  return selected !== -1 ? selected : items.findIndex(isEnabled)
}
