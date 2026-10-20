import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { keys } from '../keys'
import { useCreateAdminOrder } from './index'
import { useOrderPreview } from '../pricing'
import { useAttachRefiningFulfillment, useCreateRefiningOrder } from '../refining'
import { useLinkedAccounts, useResendBankLink, useSendBankLink } from '../payments'
import { useFulfillmentMethods, useRefinerFulfillmentMethods } from '../fulfillments'
import { useOnHandLots } from '../lots'
import { useAdminProducts } from '../products'

const USER = '00000000-0000-4000-8000-00000000000e'
const LINK = '00000000-0000-4000-8000-00000000001a'
const LOT = '00000000-0000-4000-8000-00000000001b'
const REFINER = '00000000-0000-4000-8000-00000000001c'
const METHOD = '00000000-0000-4000-8000-00000000001d'
const ORDER = '00000000-0000-4000-8000-00000000001e'
const FULFILLMENT = '00000000-0000-4000-8000-00000000001f'

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }

const respond = (body: unknown = {}, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

type Call = [string, { method: string; body?: unknown }]

const callOf = (mock: ReturnType<typeof vi.fn>, index = 0) => {
  const [url, init] = mock.mock.calls[index] as unknown as Call
  return {
    url: String(url),
    method: init.method,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
  }
}

const pathOf = (url: string) => new URL(url, 'http://x').pathname
const paramsOf = (url: string) => new URL(url, 'http://x').searchParams

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('create order keys', () => {
  it('adds a preview leaf under pricing and the linked accounts under accounts', () => {
    const body = { kind: 'customer_purchase' as const, user_id: USER, lots: [] }
    expect(keys.pricing.preview(body)).toEqual(['pricing', 'preview', body])
    expect(keys.accounts.all()).toEqual(['accounts'])
    expect(keys.accounts.bankLinks(USER)).toEqual(['accounts', 'bank_links', USER])
    expect(keys.fulfillments.refinerMethods()).toEqual(['fulfillments', 'methods', 'refiner'])
    expect(keys.lots.onHand({ metal_id: 'Gold', q: '' })).toEqual([
      'lots',
      'on_hand',
      { metal_id: 'Gold', q: '' },
    ])
    expect(keys.products.admin()).toEqual(['products', 'admin'])
  })
})

describe('the admin order create', () => {
  it('posts the AdminOrderCreate body to /orders/admin and drops every order read', async () => {
    const fetchMock = respond({ order: { id: ORDER } }, 201)
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateAdminOrder(), { wrapper: wrapperFor(client) })
    const body = {
      direction: 'purchase' as const,
      user_id: USER,
      lots: [{ metal_id: 'Gold', pre_melt: 12.4, purity: 0.583, unit: 'g', premium: 0.75 }],
      fulfillment: { method_id: METHOD, choices: { shipment: { carrier_service_id: METHOD } } },
      payout: { method: 'ACH', bank_link_id: LINK },
    }
    await act(async () => {
      await result.current.mutateAsync(body)
    })
    expect(callOf(fetchMock)).toEqual({ url: '/orders/admin', method: 'POST', body })
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.orders.all() })
  })
})

describe('the pricing preview', () => {
  it('posts the drawer state to /pricing/preview and keys the read by the body', async () => {
    const preview = { kind: 'customer_purchase', lines: [], total: 0 }
    const fetchMock = respond(preview)
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const body = {
      kind: 'customer_purchase' as const,
      user_id: USER,
      lots: [{ bullion_id: LOT, quantity: 10, premium: 0.98 }],
    }
    const { result } = renderHook(() => useOrderPreview(body), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock)).toEqual({ url: '/pricing/preview', method: 'POST', body })
    expect(client.getQueryData(keys.pricing.preview(body))).toEqual(preview)
  })

  it('stays idle with no body', () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useOrderPreview(null), { wrapper: wrapperFor(newClient()) })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the refiner order create', () => {
  it('posts RefiningOrderCreate to /refining/orders and drops refining and order reads', async () => {
    const fetchMock = respond({ id: ORDER }, 201)
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateRefiningOrder(), { wrapper: wrapperFor(client) })
    const body = { refiner_id: REFINER, direction: 'sell' as const, lot_ids: [LOT] }
    await act(async () => {
      await result.current.mutateAsync(body)
    })
    expect(callOf(fetchMock)).toEqual({ url: '/refining/orders', method: 'POST', body })
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.refining.all() })
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.orders.all() })
  })

  it('attaches the drop-off to the new refiner order: create the fulfillment, then patch its choices', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fulfillment: { id: FULFILLMENT } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ fulfillment: { id: FULFILLMENT } })))
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useAttachRefiningFulfillment(), {
      wrapper: wrapperFor(client),
    })
    const choices = {
      dropoff: {
        refiner_id: REFINER,
        start_time: '2026-06-18T18:00:00.000Z',
        end_time: '2026-06-18T20:00:00.000Z',
      },
    }
    await act(async () => {
      await result.current.mutateAsync({ refining_order_id: ORDER, method_id: METHOD, choices })
    })
    expect(callOf(fetchMock, 0)).toEqual({
      url: '/fulfillments',
      method: 'POST',
      body: { refining_order_id: ORDER, method_id: METHOD },
    })
    expect(callOf(fetchMock, 1)).toEqual({
      url: `/fulfillments/${FULFILLMENT}`,
      method: 'PATCH',
      body: choices,
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.refining.all() })
  })
})

describe('linked bank accounts (ruling 160)', () => {
  it('lists a customer linked accounts under the accounts key', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const { result } = renderHook(() => useLinkedAccounts(USER), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock)).toMatchObject({ url: `/accounts/${USER}/bank-links`, method: 'GET' })
    expect(client.getQueryData(keys.accounts.bankLinks(USER))).toEqual([])
  })

  it('polls while a link is pending so Continue opens when the webhook lands', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: LINK, status: 'pending' }])))
      .mockResolvedValue(new Response(JSON.stringify([{ id: LINK, status: 'verified' }])))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLinkedAccounts(USER), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('pending'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('verified'))
    const calls = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchMock.mock.calls.length).toBe(calls)
    vi.useRealTimers()
  })

  it('stays idle with no customer', () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useLinkedAccounts(null), { wrapper: wrapperFor(newClient()) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a Hosted Link with the channel only and refreshes the list', async () => {
    const fetchMock = respond({ id: LINK, status: 'pending' }, 201)
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSendBankLink(USER), { wrapper: wrapperFor(client) })
    await act(async () => {
      await result.current.mutateAsync({ channel: 'sms' })
    })
    expect(callOf(fetchMock)).toEqual({
      url: `/accounts/${USER}/bank-links`,
      method: 'POST',
      body: { channel: 'sms' },
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.accounts.bankLinks(USER) })
  })

  it('resends a pending link by id', async () => {
    const fetchMock = respond({ id: LINK, status: 'pending' })
    vi.stubGlobal('fetch', fetchMock)
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useResendBankLink(USER), { wrapper: wrapperFor(client) })
    await act(async () => {
      await result.current.mutateAsync(LINK)
    })
    expect(callOf(fetchMock)).toMatchObject({
      url: `/accounts/${USER}/bank-links/${LINK}/resend`,
      method: 'POST',
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.accounts.bankLinks(USER) })
  })
})

describe('the drawer reads', () => {
  it('reads the purchase methods by direction', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useFulfillmentMethods('purchase'), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(pathOf(callOf(fetchMock).url)).toBe('/fulfillments/methods')
    expect(paramsOf(callOf(fetchMock).url).get('direction')).toBe('purchase')
  })

  it('reads the refiner methods', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRefinerFulfillmentMethods(), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock)).toMatchObject({ url: '/fulfillments/methods/refiner', method: 'GET' })
  })

  it('reads the on-hand lots by metal, with no search term needed', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useOnHandLots({ metal_id: 'Gold', q: '' }), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const { url } = callOf(fetchMock)
    expect(pathOf(url)).toBe('/lots')
    expect(paramsOf(url).get('position')).toBe('on hand')
    expect(paramsOf(url).get('metal_id')).toBe('Gold')
    expect(paramsOf(url).has('q')).toBe(false)
  })

  it('reads every on-hand lot when no metal is chosen', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useOnHandLots({ metal_id: null, q: '2481' }), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const { url } = callOf(fetchMock)
    expect(paramsOf(url).has('metal_id')).toBe(false)
    expect(paramsOf(url).get('q')).toBe('2481')
  })

  it('reads the admin product list for the bullion search', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useAdminProducts(), { wrapper: wrapperFor(newClient()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock)).toMatchObject({ url: '/products/admin', method: 'GET' })
  })
})
