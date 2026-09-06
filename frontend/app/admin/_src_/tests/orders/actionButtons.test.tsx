// The admin action buttons RENDER what the server decided.
//
// The point of the test is the absence of a decision: this component held a
// `switch (order.status)` with five hard-coded button lists, a disabled gate
// it computed from the order's lines, and the rule that completing a
// DORADO_ACCOUNT payout credits the customer. All three are `view.actions`
// now, so what is pinned here is that the same view always renders the same
// buttons - and that a PATCH carries only the status.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { OrderView } from '@dorado/contracts'

import { PurchaseOrderActionButtons } from '../../orders/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/adminPurchaseOrderActionButtons'

// @dorado/client talks to `fetch`, which is the seam an order action stubs.
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
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response
    })
  )
})

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const view = (actions: Partial<OrderView['actions']>) =>
  ({
    order: { id: 'po-1', status: 'Received', direction: 'purchase' },
    totals: null,
    items: [],
    address: null,
    shipments: [],
    pickup: null,
    payout: null,
    user: null,
    actions: {
      cancel: false,
      finalize_pricing: false,
      add_funds: false,
      send_to_refiner: false,
      buy_label: false,
      update_tracking: false,
      edit_lines: false,
      statuses: [],
      ...actions,
    },
  }) as unknown as OrderView

describe('the admin purchase-order actions', () => {
  test('the offered statuses are the buttons, named for the direction of travel', () => {
    renderWithClient(
      <PurchaseOrderActionButtons
        view={view({ statuses: ['Payment Processing', 'In Transit', 'Cancelled'] })}
      />
    )
    expect(screen.getByRole('button', { name: 'Move to Payment Processing' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Back to In Transit' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cancel Order' })).toBeDefined()
  })

  // `finalize_pricing` became `finalize` in the lots lane, and the button's
  // label with it - the frontend follows the API (ruling 44).
  test('finalizing and crediting appear only when the server says they may', () => {
    const { unmount } = renderWithClient(<PurchaseOrderActionButtons view={view({})} />)
    expect(screen.queryByRole('button', { name: /Finalize/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Credit Customer Account/ })).toBeNull()
    unmount()

    renderWithClient(
      <PurchaseOrderActionButtons view={view({ finalize: true, add_funds: true })} />
    )
    expect(screen.getByRole('button', { name: /Finalize/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Credit Customer Account/ })).toBeDefined()
  })

  // A status is a pure label and drives nothing: the PATCH carries it and
  // nothing else, and crediting is its own call rather than a side effect of
  // reaching 'Completed'.
  test('a status move PATCHes the status alone', async () => {
    renderWithClient(<PurchaseOrderActionButtons view={view({ statuses: ['Completed'] })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Move to Completed' }))

    await waitFor(() => {
      const call = sent.find((c) => c.method === 'PATCH' && c.url.endsWith('/orders/po-1'))
      expect(call).toBeTruthy()
      expect(call!.body).toEqual({ status: 'Completed' })
    })
    expect(sent.some((c) => c.url.includes('add_funds'))).toBe(false)
  })
})
