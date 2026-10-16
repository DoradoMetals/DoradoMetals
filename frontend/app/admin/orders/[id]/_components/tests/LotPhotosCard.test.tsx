import { describe, expect, test, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { OrderLotView } from '@dorado/contracts'

import { LotPhotosCard } from '../LotPhotosCard'
import { stubApi } from '../../../tests/fixtures'

const LOT_ID = '00000000-0000-4000-8000-0000000000a1'

const lot = {
  id: '00000000-0000-4000-8000-0000000000b1',
  lot_id: LOT_ID,
  name: '14K Gold',
  lot: { reference: 'A' },
} as unknown as OrderLotView

const renderCard = (defaultOpen: boolean) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LotPhotosCard lots={[lot]} defaultOpen={defaultOpen} />
    </QueryClientProvider>
  )

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LotPhotosCard', () => {
  test('collapsed: no photo fetch; opening fetches once', async () => {
    const calls = stubApi({ [`GET /lots/${LOT_ID}/images`]: [] })
    renderCard(false)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /lot photos/i }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.url.pathname).toBe(`/lots/${LOT_ID}/images`)
  })
})
