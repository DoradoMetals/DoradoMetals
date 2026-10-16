import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { keys } from '../keys'
import { useStockLotSearch } from '../lots'
import { usePaymentView } from '../payments'
import { useAddressBook } from '../places'
import { useOpenShipmentClaim, usePatchShipmentClaim, useShipmentClaims } from '../shipping'
import {
  useAddOrderNote,
  useAdoptAssay,
  useAdoptAssayProposal,
  useChangeOrderAddress,
  useCreateOrderLot,
  useIssueOrderRefund,
  useOpenLotDispute,
  useOrderAddress,
  useOrderClaims,
  useOrderDisputes,
  useOrderNotes,
  useOrderPricing,
  useOrderRefunds,
  useOrderSpotLocks,
  usePatchOrder,
  usePatchOrderLot,
  usePatchPaymentDetails,
  usePutPayoutMethods,
  useRefundOrder,
  useResolveDispute,
  useUnlinkOrderLot,
} from './queries'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }

const respond = (body: unknown = {}, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

type Call = [string, { method: string; body?: string }]

const callOf = (mock: ReturnType<typeof vi.fn>, index = 0) => {
  const [url, init] = mock.mock.calls[index] as unknown as Call
  return {
    url: String(url),
    method: init.method,
    body: init.body ? JSON.parse(init.body) : undefined,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detail keys', () => {
  it('nests every order read under the orders root', () => {
    expect(keys.orders.pricing(A)).toEqual(['orders', 'pricing', A])
    expect(keys.orders.notes(A)).toEqual(['orders', 'notes', A])
    expect(keys.orders.refunds(A)).toEqual(['orders', 'refunds', A])
    expect(keys.orders.claims(A)).toEqual(['orders', 'claims', A])
    expect(keys.orders.adoptAssay(A)).toEqual(['orders', 'adopt_assay', A])
    expect(keys.orders.address(A)).toEqual(['orders', 'address', A])
    expect(keys.orders.disputes(A)).toEqual(['orders', 'disputes', A])
    expect(keys.orders.spotLocks(A)).toEqual(['orders', 'spot_locks', A])
    expect(keys.shipping.claims(B)).toEqual(['shipping', 'claims', B])
    expect(keys.places.addresses(C)).toEqual(['places', 'addresses', C])
  })
})

describe('detail reads', () => {
  const reads: [string, () => unknown, string, string][] = [
    ['pricing', () => useOrderPricing(A), 'POST', '/quotes/order'],
    ['spot locks', () => useOrderSpotLocks(A), 'GET', `/orders/${A}/spot_locks`],
    ['notes', () => useOrderNotes(A), 'GET', `/orders/${A}/notes`],
    ['refunds', () => useOrderRefunds(A), 'GET', `/orders/${A}/refunds`],
    ['claims', () => useOrderClaims(A), 'GET', `/orders/${A}/claims`],
    ['adopt assay', () => useAdoptAssayProposal(A), 'GET', `/orders/${A}/adopt_assay`],
    ['address', () => useOrderAddress(A), 'GET', `/orders/${A}/address`],
    ['disputes', () => useOrderDisputes(A), 'GET', `/orders/${A}/disputes`],
    ['payment view', () => usePaymentView(A), 'GET', `/payments/view/${A}`],
    ['shipment claims', () => useShipmentClaims(B), 'GET', `/shipments/${B}/claims`],
    ['address book', () => useAddressBook(C), 'GET', `/addresses?user_id=${C}`],
  ]

  it.each(reads)('reads %s', async (_name, hook, method, url) => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(hook as () => { isSuccess: boolean }, {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock)).toMatchObject({ method, url })
  })

  it('prices the order by id in the body', async () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useOrderPricing(A), { wrapper: wrapperFor(newClient()) })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).body).toEqual({ order_id: A })
  })

  it('stays idle with no id', () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useOrderNotes(''), { wrapper: wrapperFor(newClient()) })
    renderHook(() => useShipmentClaims(''), { wrapper: wrapperFor(newClient()) })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('detail writes', () => {
  const stamp = '2026-10-15T10:00:00.000Z'
  const writes: [
    string,
    () => { mutateAsync: (v: never) => Promise<unknown> },
    unknown,
    string,
    string,
    unknown,
  ][] = [
    [
      'patch order',
      () => usePatchOrder(A),
      { cancelled_at: null, expected_updated_at: stamp },
      'PATCH',
      `/orders/${A}`,
      { cancelled_at: null, expected_updated_at: stamp },
    ],
    [
      'patch lot',
      () => usePatchOrderLot(A),
      { lot_id: B, patch: { purity: 0.5, expected_updated_at: stamp } },
      'PATCH',
      `/orders/lots/${B}`,
      { purity: 0.5, expected_updated_at: stamp },
    ],
    [
      'unlink lot',
      () => useUnlinkOrderLot(A),
      { lot_id: B, reason: 'combined at intake' },
      'POST',
      `/orders/lots/${B}/unlink`,
      { reason: 'combined at intake' },
    ],
    [
      'add note',
      () => useAddOrderNote(A),
      { body: 'Called the customer' },
      'POST',
      `/orders/${A}/notes`,
      { body: 'Called the customer' },
    ],
    [
      'payout methods',
      () => usePutPayoutMethods(A),
      { methods: [{ method_id: C, amount: 10 }] },
      'PUT',
      `/orders/${A}/payout_methods`,
      { methods: [{ method_id: C, amount: 10 }] },
    ],
    [
      'refund',
      () => useRefundOrder(A),
      { amount: 12, reason: 'Damaged coin returned' },
      'POST',
      `/orders/${A}/refunds`,
      { amount: 12, reason: 'Damaged coin returned' },
    ],
    [
      'issue refund',
      () => useIssueOrderRefund(A),
      B,
      'POST',
      `/orders/${A}/refunds/${B}/issue`,
      {},
    ],
    [
      'adopt assay',
      () => useAdoptAssay(A),
      { lots: [{ id: B, figures: { purity: 0.9 } }] },
      'POST',
      `/orders/${A}/adopt_assay`,
      { lots: [{ id: B, figures: { purity: 0.9 } }] },
    ],
    [
      'change address',
      () => useChangeOrderAddress(A),
      { address_id: C, reason: 'Customer moved house' },
      'POST',
      `/orders/${A}/address`,
      { address_id: C, reason: 'Customer moved house' },
    ],
    [
      'open dispute',
      () => useOpenLotDispute(A),
      { order_lot_id: B, claimed_purity: 0.9, reason: 'Refiner assay' },
      'POST',
      `/orders/lots/${B}/disputes`,
      { claimed_purity: 0.9, reason: 'Refiner assay' },
    ],
    [
      'resolve dispute',
      () => useResolveDispute(A),
      { dispute_id: B, resolution: 'Kept ours' },
      'PATCH',
      `/orders/disputes/${B}`,
      { resolution: 'Kept ours' },
    ],
    [
      'open claim',
      () => useOpenShipmentClaim(A),
      { shipment_id: B, kind: 'lost', amount: 100 },
      'POST',
      `/shipments/${B}/claims`,
      { kind: 'lost', amount: 100 },
    ],
    [
      'choose one payout method',
      () => usePutPayoutMethods(A),
      { methods: [{ method_id: C }] },
      'PUT',
      `/orders/${A}/payout_methods`,
      { methods: [{ method_id: C }] },
    ],
    [
      'declare a lot',
      () => useCreateOrderLot(A),
      { metal_id: 'gold', unit: 'g', quantity: 1, pre_melt: 10 },
      'POST',
      `/orders/${A}/lots`,
      { metal_id: 'gold', unit: 'g', quantity: 1, pre_melt: 10 },
    ],
    [
      'assign a stock lot',
      () => useCreateOrderLot(A),
      { lot_id: B },
      'POST',
      `/orders/${A}/lots`,
      { lot_id: B },
    ],
    [
      'payout charge',
      () => usePatchPaymentDetails(A),
      { details_id: B, cost: 5 },
      'PATCH',
      `/payments/details/${B}`,
      { cost: 5 },
    ],
    [
      'patch claim',
      () => usePatchShipmentClaim(A),
      { shipment_id: B, claim_id: C, status: 'Paid' },
      'PATCH',
      `/shipments/${B}/claims/${C}`,
      { status: 'Paid' },
    ],
  ]

  it.each(writes)('%s', async (_name, hook, variables, method, url, body) => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(hook, { wrapper: wrapperFor(newClient()) })
    await result.result.current.mutateAsync(variables as never)
    expect(callOf(fetchMock)).toEqual({ method, url, body })
  })

  it('refetches the order reads after a write', async () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const result = renderHook(() => useAddOrderNote(A), { wrapper: wrapperFor(client) })
    await result.result.current.mutateAsync({ body: 'x' })
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: keys.orders.all() }))
  })

  it('refreshes the order claims after a claim write', async () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const result = renderHook(() => useOpenShipmentClaim(A), { wrapper: wrapperFor(client) })
    await result.result.current.mutateAsync({ shipment_id: B, kind: 'lost', amount: 1 })
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: keys.orders.claims(A) }))
  })

  it('rejects with the API status on a stale save', async () => {
    vi.stubGlobal('fetch', respond({ message: 'stale' }, 409))
    const result = renderHook(() => usePatchOrder(A), { wrapper: wrapperFor(newClient()) })
    await expect(
      result.result.current.mutateAsync({ notes: 'x', expected_updated_at: stamp })
    ).rejects.toMatchObject({ status: 409, message: 'stale' })
  })
})

describe('stock lot search', () => {
  it('asks the API for on-hand lots only', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useStockLotSearch('gold'), { wrapper: wrapperFor(newClient()) })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    const { url, method } = callOf(fetchMock)
    expect(method).toBe('GET')
    expect(url).toContain('/lots?')
    expect(new URL(url, 'http://x').searchParams.get('position')).toBe('on hand')
    expect(new URL(url, 'http://x').searchParams.get('q')).toBe('gold')
  })
})
