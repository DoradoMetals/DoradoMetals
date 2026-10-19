import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { keys } from '../keys'
import { useAddLotImage, useLotImages, useRemoveLotImage } from '../lots'
import { useSelectionSummary } from '../pricing'
import { downloadRefiningDocument, refiningDocumentUrl } from '../refining'
import {
  downloadOrderDocument,
  orderDocumentUrl,
  useOrderActivity,
  useOrderSummary,
} from './queries'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

const urlOf = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  String((mock.mock.calls[call] as unknown[])[0])

const methodOf = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  String(((mock.mock.calls[call] as unknown[])[1] as { method: string }).method)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shell keys', () => {
  it('spells the activity, image and selection keys', () => {
    expect(keys.orders.activity(A, { limit: 10, before: 'x' })).toEqual([
      'orders',
      'activity',
      A,
      10,
      'x',
    ])
    expect(keys.orders.activity(A)).toEqual(['orders', 'activity', A, null, null])
    expect(keys.lots.images(A)).toEqual(['lots', 'images', A])
    expect(keys.pricing.selection([A, B])).toEqual(['pricing', 'selection', [A, B]])
  })
})

describe('useOrderActivity', () => {
  it('asks for the activity page with limit and before', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const hook = renderHook(
      () => useOrderActivity(A, { limit: 50, before: '2026-01-01T00:00:00.000Z' }),
      { wrapper: wrapperFor(newClient()) }
    )
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    const url = urlOf(fetchMock)
    expect(url).toContain(`/orders/${A}/activity?`)
    expect(url).toContain('limit=50')
    expect(url).toContain('before=2026-01-01T00%3A00%3A00.000Z')
  })

  it('stays idle when disabled', () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useOrderActivity(A, {}, { enabled: false }), {
      wrapper: wrapperFor(newClient()),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('lot image hooks', () => {
  it('lists, adds and removes through the lot images paths', async () => {
    const images = [{ image_id: B, sort_order: 0, url: 'u' }]
    const fetchMock = respond(images)
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const list = renderHook(() => useLotImages(A), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(list.result.current.data).toEqual(images))
    expect(urlOf(fetchMock)).toBe(`/lots/${A}/images`)

    const add = renderHook(() => useAddLotImage(A), { wrapper: wrapperFor(client) })
    await add.result.current.mutateAsync({ image_id: B })
    const addCall = fetchMock.mock.calls.findIndex(
      (c) => (c as unknown[])[1] && methodOf(fetchMock, fetchMock.mock.calls.indexOf(c)) === 'POST'
    )
    expect(urlOf(fetchMock, addCall)).toBe(`/lots/${A}/images`)

    const remove = renderHook(() => useRemoveLotImage(A), { wrapper: wrapperFor(client) })
    await remove.result.current.mutateAsync(B)
    const delCall = fetchMock.mock.calls.findIndex(
      (c) => methodOf(fetchMock, fetchMock.mock.calls.indexOf(c)) === 'DELETE'
    )
    expect(urlOf(fetchMock, delCall)).toBe(`/lots/${A}/images/${B}`)
    expect(client.getQueryData(keys.lots.images(A))).toEqual(images)
  })
})

describe('useSelectionSummary', () => {
  it('repeats order_ids once per id', async () => {
    const fetchMock = respond({ order_count: 2, lot_count: 0, estimated_value: 0, fine_oz: [] })
    vi.stubGlobal('fetch', fetchMock)
    const hook = renderHook(() => useSelectionSummary([A, B]), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    expect(urlOf(fetchMock)).toBe(`/pricing/selection?order_ids=${A}&order_ids=${B}`)
  })

  it('does not call with an empty selection', () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useSelectionSummary([]), { wrapper: wrapperFor(newClient()) })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('document download', () => {
  it('builds the two urls', () => {
    expect(orderDocumentUrl(A, 'invoice')).toBe(`/orders/${A}/documents/invoice`)
    expect(refiningDocumentUrl(A, 'invoice')).toBe(`/refining/orders/${A}/documents/invoice`)
  })

  it('fetches bytes as a blob', async () => {
    const fetchMock = vi.fn(async () => new Response('%PDF', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const blob = await downloadOrderDocument(A, 'invoice')
    expect(await blob.text()).toBe('%PDF')
    expect(urlOf(fetchMock)).toBe(`/orders/${A}/documents/invoice`)
    await downloadRefiningDocument(A, 'invoice')
    expect(urlOf(fetchMock, 1)).toBe(`/refining/orders/${A}/documents/invoice`)
  })
})

describe('useOrderSummary', () => {
  it('asks for the direction totals and nothing the list filters by', async () => {
    const fetchMock = respond({ orders: 3, unassigned_lots: 1, states: [] })
    vi.stubGlobal('fetch', fetchMock)
    const hook = renderHook(() => useOrderSummary('purchase'), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    const url = new URL(urlOf(fetchMock), 'http://localhost')
    expect(url.pathname.endsWith('/orders/summary')).toBe(true)
    expect([...url.searchParams.keys()]).toEqual(['direction'])
    expect(url.searchParams.get('direction')).toBe('purchase')
    expect(keys.orders.summary('purchase')).toEqual(['orders', 'summary', 'purchase'])
  })
})
