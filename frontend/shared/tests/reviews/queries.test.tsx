// What useUpdateReview actually sends on the wire, checked against the
// contract's own strict schema.
//
// D214 item 4 made this a REST call: PATCH /reviews/:id with a bare
// ReviewPatch body (the old POST /reviews/update took { review_id, patch }
// instead). The hook still takes { review_id, patch } as its mutation
// variables - only the id moved from the body into the URL. user_name has
// never been a field of ReviewPatch; naming it gets a 400.
//
// The hooks live in @dorado/client now and build their request with that
// package's own `apiRequest` (a thin wrapper over the global `fetch`, not
// axios) - so this test stubs `fetch` directly rather than mocking
// `@/shared/queries/axios`, which the new hooks never call.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ReviewPatch } from '@dorado/contracts'

import { useUpdateReview } from '@/shared/hooks/reviews/queries'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: '9f1c2b3a-0000-4000-8000-000000000002' }),
    })
  )
})

describe('useUpdateReview sends exactly what PATCH /reviews/:id accepts', () => {
  test('a real edit PATCHes /reviews/:id with a bare patch that parses clean', async () => {
    const { result } = renderHook(() => useUpdateReview(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        review_id: '9f1c2b3a-0000-4000-8000-000000000002',
        patch: { hidden: true },
      })
    })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/reviews\/9f1c2b3a-0000-4000-8000-000000000002$/)
    expect(init.method).toBe('PATCH')

    const body: unknown = JSON.parse(init.body as string)
    expect(body).not.toHaveProperty('review_id')
    expect(body).not.toHaveProperty('patch')
    expect(ReviewPatch.strict().safeParse(body).success).toBe(true)
  })

  // The regression this test exists for: the hook used to also send
  // user_name, which the strict contract has never declared.
  test('never carries user_name - the strict schema would 400 on it', async () => {
    const { result } = renderHook(() => useUpdateReview(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        review_id: '9f1c2b3a-0000-4000-8000-000000000002',
        patch: { name: 'Edited Name' },
      })
    })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).not.toHaveProperty('user_name')

    const withUserName = { ...body, user_name: 'Dorado Admin' }
    expect(ReviewPatch.strict().safeParse(withUserName).success).toBe(false)
  })
})
