import { describe, expect, test, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/shared/hooks/auth/authClient', () => ({
  auth: { $store: { notify: vi.fn() } },
  useUser: () => ({ user: undefined, session: undefined, error: null, isPending: false }),
}))

import { useGetSession } from '@/shared/hooks/auth/queries'

describe('useGetSession', () => {
  test('retry keeps its identity across renders', () => {
    const { result, rerender } = renderHook(() => useGetSession())
    const first = result.current.retry
    rerender()
    expect(result.current.retry).toBe(first)
  })
})
