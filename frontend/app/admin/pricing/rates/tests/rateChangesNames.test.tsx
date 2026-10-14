import { afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RateChangeRow } from '@dorado/contracts'

import { RateChangesPanel } from '../_components'

const ANN = '00000000-0000-4000-8000-00000000000a'
const GONE = '00000000-0000-4000-8000-00000000000d'

const row = (id: string, actor_id: string | null): RateChangeRow => ({
  id,
  actor_id,
  changed_at: '2026-10-14T12:00:00Z',
  metal_id: 'Gold',
  type: 'scrap',
  old_band: { unit: 'troy_oz', min_qty: 0, max_qty: null, scrap_pct: 0.7, bullion_pct: null },
  new_band: { unit: 'troy_oz', min_qty: 0, max_qty: null, scrap_pct: 0.72, bullion_pct: null },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the rate changes panel', () => {
  test('resolves every actor on the page in one call', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([{ id: ANN, name: 'Ann Admin' }]), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <RateChangesPanel
          rows={[
            row('00000000-0000-4000-8000-000000000001', ANN),
            row('00000000-0000-4000-8000-000000000002', ANN),
            row('00000000-0000-4000-8000-000000000003', GONE),
            row('00000000-0000-4000-8000-000000000004', null),
          ]}
          mobile={false}
          search=""
          page={1}
          pageCount={1}
          onSearch={() => {}}
          onPageChange={() => {}}
        />
      </QueryClientProvider>
    )

    await waitFor(() => expect(screen.getAllByText('Ann Admin')).toHaveLength(2))
    expect(screen.getByText('Unknown')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
