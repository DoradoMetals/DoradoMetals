// The admin "send to supplier" step, rendered.
//
// This is the screen where metal leaves the building: an admin picks the
// refiner and the click emails them the order. Same rules as the other
// converted features - jsdom, real component tree, network mocked by URL.
// The send is its own action route, and the lots lane RENAMED it:
// POST /orders/:id/supply { refiner_id } (was `send_to_refiner`). It answers
// the refining order it opened - the business's own order to a counterparty -
// and the order's spots resolve SERVER-side, so the body carries no pricing
// arrays. The URL and the exact document are the pin (ruling 44: the frontend
// follows the API).
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/shared/hooks/auth/queries', () => ({
  useGetSession: () => ({ user: { id: 'u-admin', role: 'admin', name: 'Admin' } }),
}))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('img', { src: props.src, alt: String(props.alt ?? '') }),
}))

import AdminPreparingSalesOrder from '../../orders/salesOrders/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminPreparing'
import type { OrderView } from '@dorado/contracts'

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

// THE SLIM WIRE (wave 3). Neither field this fixture used to carry is a
// column of the order: `supplier_id` was refiners.orders.refiner_id aliased
// on, and the shipment was a nested slot. Both are their own reads now, and
// the mock below answers them.
// THE VIEW, not the row - a drawer child renders one OrderView.
const view = (order: Record<string, unknown>) =>
  ({
    order,
    totals: null,
    lots: [],
    address: null,
    shipments: [],
    pickup: null,
    payout: null,
    user: null,
    actions: {
      cancel: false,
      reopen: false,
      finalize: false,
      add_funds: false,
      supply: true,
      buy_label: false,
      update_tracking: true,
      edit_lots: false,
      assign_lots: false,
      statuses: [],
      finalize_blocked_by: [],
    },
  }) as unknown as OrderView
const order = () => view({ id: 'so-1', status: 'Preparing', order_sent: false })

// THE CLIENT PACKAGE TALKS TO `fetch`, NOT TO THIS APP'S AXIOS WRAPPER.
// @dorado/client carries no runtime dependency of its own, so the seam a test
// stubs for an order action is the platform one. Recorded, so the assertion
// below can read the URL and the body it sent. The supplier list answers
// through this seam too. THE ENGAGEMENT READ IS GONE: `refiners.orders` died
// with the lots lane and no key joins a refining order to a customer order
// (ruling 42), so nothing asks `/orders/:id/refiners` any more.
const sent: { method: string; url: string; body: unknown }[] = []

beforeEach(() => {
  sent.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({
        method: init?.method ?? 'GET',
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (String(url).endsWith('/suppliers/get_all')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              {
                id: 's-1',
                logo: '/logos/elemetal.png',
                created_at: null,
                updated_at: null,
                organization: { name: 'Elemetal', email: null, phone: null, enabled: true },
              },
            ]),
        } as unknown as Response
      }
      // A LIST where the endpoint answers rows - `useCarriers`/`.find()`
      // and `outboundOf` both throw on a bare `{}` fallback.
      const isList = /\/shipments|\/carriers\/get|\/carrier_services\/get/.test(String(url))
      const body = isList ? '[]' : '{}'
      return { ok: true, status: 200, text: async () => body } as unknown as Response
    })
  )
})

describe('sending a sales order to a supplier', () => {
  test('the refiners are offered by name', async () => {
    renderWithClient(<AdminPreparingSalesOrder view={order()} />)
    await waitFor(() => expect(screen.getAllByText('Elemetal').length).toBeGreaterThan(0))
  })

  test('the send POSTs the refiner id to supply', async () => {
    renderWithClient(<AdminPreparingSalesOrder view={order()} />)
    await waitFor(() => expect(screen.getAllByText('Elemetal').length).toBeGreaterThan(0))

    await userEvent.click(screen.getByRole('radio'))
    await userEvent.click(await screen.findByRole('button', { name: /send order to elemetal/i }))

    await waitFor(() => {
      const call = sent.find(
        (c) => c.method === 'POST' && c.url.endsWith('/orders/so-1/supply')
      )
      expect(call).toBeTruthy()
      // The WHOLE document: the refiner id and nothing else - no spots, no
      // order copy. toEqual is exact in both directions, so a stray field
      // fails here before the API refuses it by name.
      expect(call!.body).toEqual({ refiner_id: 's-1' })
    })
  })
})
