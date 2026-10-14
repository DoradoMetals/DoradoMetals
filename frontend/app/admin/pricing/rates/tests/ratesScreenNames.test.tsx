import { afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RatesScreen } from '../_components'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/pricing/rates',
  useSearchParams: () => new URLSearchParams(),
}))

const ANN = '00000000-0000-4000-8000-00000000000a'

const rate = {
  id: '00000000-0000-4000-8000-000000000001',
  metal_id: 'Gold',
  unit: 'troy_oz',
  min_qty: 0,
  max_qty: null,
  scrap_pct: 0.7,
  bullion_pct: 0.9,
  created_at: '2026-10-14T12:00:00Z',
  updated_at: '2026-10-14T12:00:00Z',
  created_by_id: null,
  updated_by_id: ANN,
}

const pay = {
  metal_id: 'Gold',
  unit: 'troy_oz',
  min_qty: 0,
  max_qty: null,
  scrap_pct: 0.7,
  bullion_pct: 0.9,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the rates screen', () => {
  test('names the last changer through the id lookup', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const path = String(url)
      const body = path.includes('/users')
        ? [{ id: ANN, name: 'Ann Admin' }]
        : path.includes('/admin')
          ? [rate]
          : path.includes('/changes')
            ? { rows: [], total: 0, page: 1, page_size: 10 }
            : [pay]
      return new Response(JSON.stringify(body), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <RatesScreen />
      </QueryClientProvider>
    )
    expect(await screen.findByText(/by Ann Admin/)).toBeTruthy()
  })
})
