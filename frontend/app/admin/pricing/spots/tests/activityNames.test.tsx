import { afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SpotActivity } from '@dorado/contracts'

import { ActivitySection } from '../[metal]/_components'

const BO = '00000000-0000-4000-8000-00000000000b'

const entry = (id: string, actor_id: string | null): SpotActivity => ({
  id,
  kind: 'adjustment',
  event: 'adjustment set',
  at: '2026-10-14T12:00:00Z',
  actor_id,
  order_id: null,
  reference: null,
  source_id: null,
  field: 'bid_amount',
  old_value: null,
  new_value: '-1',
  bid: null,
  ask: null,
  detail: null,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the metal activity', () => {
  test('resolves the actors on screen in one call', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([{ id: BO, name: 'Bo Admin' }]), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <ActivitySection
          activity={[
            entry('00000000-0000-4000-8000-000000000001', BO),
            entry('00000000-0000-4000-8000-000000000002', BO),
            entry('00000000-0000-4000-8000-000000000003', null),
          ]}
          sources={[]}
        />
      </QueryClientProvider>
    )

    await waitFor(() => expect(screen.getAllByText('Bo Admin')).toHaveLength(2))
    expect(screen.getByText('System')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(decodeURIComponent(String((fetchMock.mock.calls[0] as unknown[])[0]))).toContain(
      `/users/names?ids=${BO}`
    )
  })
})
