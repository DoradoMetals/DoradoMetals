// What useCreateCarrier, useUpdateCarrier and useUpdateCarrierService
// actually POST, checked against @dorado/contracts' CarrierPatch/
// CarrierPatch/CarrierServicePatch in strict mode. Every one of these hooks
// used to spread the whole READ shape into the body - organization.id,
// created_at, updated_at for carriers; created_by/updated_by/created_at/
// updated_at for services - none of which the write contract declares. This
// file fails if any of them reappears.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CarrierPatch, CarrierServicePatch } from '@dorado/contracts'

vi.mock('@/shared/hooks/auth/queries', () => ({
  useGetSession: () => ({ user: { id: 'u-admin', role: 'admin' } }),
}))

import { useCreateCarrier, useUpdateCarrier, useUpdateCarrierService } from '../../carriers/queries'
import type { Carrier, CarrierService } from '../../carriers/types'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const aCarrier = (): Carrier => ({
  id: '9f1c2b3a-0000-4000-8000-000000000006',
  logo: '/logo.svg',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  organization: {
    id: '9f1c2b3a-0000-4000-8000-000000000007',
    name: 'FedEx',
    email: 'support@fedex.com',
    phone: '5555555555',
    enabled: true,
  },
})

const aService = (): CarrierService => ({
  id: '9f1c2b3a-0000-4000-8000-000000000008',
  carrier_id: '9f1c2b3a-0000-4000-8000-000000000006',
  name: 'Express Saver',
  description: null,
  code: '',
  provider_code: '',
  min_transit_days: 0,
  max_transit_days: 0,
  supports_pickup: false,
  supports_dropoff: true,
  supports_returns: false,
  max_weight_lbs: null,
  max_length_in: null,
  max_width_in: null,
  max_height_in: null,
  supports_insurance: true,
  max_declared_value: null,
  is_international: false,
  is_residential: true,
  is_active: true,
  display_order: 0,
  created_by: 'Dorado Metals',
  updated_by: 'Dorado Metals',
  created_at: '2025-12-30T00:26:40.731Z',
  updated_at: '2025-12-31T17:21:41.140Z',
})

// The hooks live in @dorado/client now, which talks to the platform's `fetch`
// rather than the axios wrapper this file used to stub.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }) as unknown as Response)
  )
})

describe('useCreateCarrier sends exactly what /carriers/create accepts', () => {
  test('parses clean and drops organization.id/created_at/updated_at', async () => {
    const { result } = renderHook(() => useCreateCarrier(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(aCarrier())
    })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/carriers\/create$/)

    const b = JSON.parse(String(init.body)) as { carrier: Record<string, unknown> }
    expect(CarrierPatch.strict().safeParse(b.carrier).success).toBe(true)
    expect(b.carrier).not.toHaveProperty('id')
    expect(b.carrier).not.toHaveProperty('created_at')
    expect(b.carrier).not.toHaveProperty('updated_at')
    expect(b.carrier.organization as Record<string, unknown>).not.toHaveProperty('id')
  })
})

describe('useUpdateCarrier sends exactly what /carriers/update accepts', () => {
  test('parses clean and drops organization.id/created_at/updated_at', async () => {
    const { result } = renderHook(() => useUpdateCarrier(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(aCarrier())
    })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/carriers\/update$/)

    const b = JSON.parse(String(init.body)) as { carrier: Record<string, unknown> }
    const parsed = CarrierPatch.strict().safeParse(b.carrier)
    expect(parsed.success).toBe(true)
    expect(b.carrier).not.toHaveProperty('created_at')
    expect(b.carrier).not.toHaveProperty('updated_at')
    expect(b.carrier.organization as Record<string, unknown>).not.toHaveProperty('id')

    // Proven: naming organization.id would fail the same parse.
    const withOrgId = {
      ...b.carrier,
      organization: { ...(b.carrier.organization as object), id: 'x' },
    }
    expect(CarrierPatch.strict().safeParse(withOrgId).success).toBe(false)
  })
})

describe('useUpdateCarrierService sends exactly what /carrier_services/update accepts', () => {
  test('parses clean and drops created_by/updated_by/created_at/updated_at', async () => {
    const { result } = renderHook(() => useUpdateCarrierService(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(aService())
    })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/carrier_services\/update$/)

    const b = JSON.parse(String(init.body)) as { service: Record<string, unknown> }
    const parsed = CarrierServicePatch.strict().safeParse(b.service)
    expect(parsed.success).toBe(true)

    for (const retired of ['created_by', 'updated_by', 'created_at', 'updated_at']) {
      expect(b.service).not.toHaveProperty(retired)
    }

    // The aliases stay - dropping them would silently render every toggle off.
    expect(b.service).toHaveProperty('supports_pickup')
    expect(b.service).toHaveProperty('max_weight_lbs')
  })
})
