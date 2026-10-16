import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  ACTIVITY_PAGE,
  contentOf,
  useCustomerAddresses,
  useDetailActivity,
  useDetailClaims,
  useDetailDisputes,
  useDetailProfit,
  useDetailRefunds,
  usePayToFor,
} from '../_api'
import { stubApi } from '../../tests/fixtures'
import { CUSTOMER_ID, ORDER_ID } from './screenFixtures'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('contentOf', () => {
  test('maps a read to a card content state', () => {
    expect(contentOf({ isPending: true, isError: false })).toBe('loading')
    expect(contentOf({ isPending: false, isError: true })).toBe('error')
    expect(contentOf({ isPending: false, isError: false, data: [] })).toBe('loaded')
    expect(contentOf({ isPending: true, isError: false, data: [] })).toBe('loaded')
  })
})

describe('direction-gated reads', () => {
  test('a purchase reads profit and disputes, never refunds, claims or the address book', async () => {
    const calls = stubApi({
      'POST /quotes/profit_breakdown': {},
      [`GET /orders/${ORDER_ID}/disputes`]: [],
      'GET /payments/payouts/pay_to': [],
    })
    renderHook(
      () => {
        useDetailProfit(ORDER_ID, 'purchase')
        useDetailDisputes(ORDER_ID, 'purchase')
        useDetailRefunds(ORDER_ID, 'purchase')
        useDetailClaims(ORDER_ID, 'purchase')
        useCustomerAddresses(CUSTOMER_ID, 'purchase')
        usePayToFor(CUSTOMER_ID, 'purchase')
      },
      { wrapper }
    )
    await waitFor(() => expect(calls.length).toBe(3))
    expect(calls.map((c) => c.url.pathname).sort()).toEqual(
      [
        '/orders/' + ORDER_ID + '/disputes',
        '/payments/payouts/pay_to',
        '/quotes/profit_breakdown',
      ].sort()
    )
  })

  test('a sale reads refunds, claims and the address book, never profit or disputes', async () => {
    const calls = stubApi({
      [`GET /orders/${ORDER_ID}/refunds`]: [],
      [`GET /orders/${ORDER_ID}/claims`]: [],
      'GET /addresses': [],
    })
    renderHook(
      () => {
        useDetailProfit(ORDER_ID, 'sale')
        useDetailDisputes(ORDER_ID, 'sale')
        useDetailRefunds(ORDER_ID, 'sale')
        useDetailClaims(ORDER_ID, 'sale')
        useCustomerAddresses(CUSTOMER_ID, 'sale')
        usePayToFor(CUSTOMER_ID, 'sale')
      },
      { wrapper }
    )
    await waitFor(() => expect(calls.length).toBe(3))
    expect(
      calls.find((c) => c.url.pathname === '/addresses')!.url.searchParams.get('user_id')
    ).toBe(CUSTOMER_ID)
  })

  test('nothing gated reads before the direction is known', async () => {
    const calls = stubApi({})
    renderHook(
      () => {
        useDetailProfit(ORDER_ID, null)
        useDetailRefunds(ORDER_ID, undefined)
      },
      { wrapper }
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toEqual([])
  })

  test('activity asks for one page', async () => {
    const calls = stubApi({ [`GET /orders/${ORDER_ID}/activity`]: [] })
    renderHook(() => useDetailActivity(ORDER_ID), { wrapper })
    await waitFor(() => expect(calls.length).toBe(1))
    expect(calls[0].url.searchParams.get('limit')).toBe(String(ACTIVITY_PAGE))
  })
})
