import type { ReactElement } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { vi } from 'vitest'

export type SetupResult = RenderResult & { user: UserEvent }

export type SetupOptions = RenderOptions & { fakeTimers?: boolean }

export function setup(
  ui: ReactElement,
  { fakeTimers = false, ...options }: SetupOptions = {}
): SetupResult {
  const user = userEvent.setup(
    fakeTimers ? { advanceTimers: (ms) => vi.advanceTimersByTime(ms) } : {}
  )
  return { user, ...render(ui, options) }
}

export function classList(element: Element | null): string[] {
  if (!element) throw new Error('classList: no element')
  return Array.from(element.classList).sort()
}

export function useUserFakeTimers(): void {
  vi.useFakeTimers({ shouldAdvanceTime: true })
}
