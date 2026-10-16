import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RefinerOrderScreen } from '../_components'
import { ADMIN, ORDER, action, desktop, lot, order, routesFor, stubApi } from './fixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/admin/orders/refiners/${ORDER}`,
  useSearchParams: () => new URLSearchParams(),
}))

const wrap = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => desktop(true))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RefinerOrderScreen header', () => {
  test('shows the eyebrow, the state badge, the refiner, the reference with its city and orders to date', async () => {
    stubApi(routesFor(order()))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('Elemetal Refining')).toBeTruthy()
    expect(screen.getByText('Sales order')).toBeTruthy()
    expect(screen.getAllByText('Pending Assay').length).toBeGreaterThan(0)
    expect(screen.getByText('RS-2493 · Dallas, TX')).toBeTruthy()
    expect(screen.getByText('12 orders to date')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toBeTruthy()
  })

  test('the header carries the breadcrumb Admin > Orders > reference', async () => {
    stubApi(routesFor(order()))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    await screen.findByText('Elemetal Refining')
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/admin')
    expect(within(crumbs).getByRole('link', { name: 'Orders' }).getAttribute('href')).toBe(
      '/admin/orders'
    )
    expect(within(crumbs).getByText('RS-2493')).toBeTruthy()
    expect(within(crumbs).queryByRole('link', { name: 'RS-2493' })).toBeNull()
  })

  test('draws Send only while the order is unsent', async () => {
    stubApi(routesFor(order({ direction: 'buy', number: 'RP-2493', actions: [action('send')] })))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('Purchase order')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  test('Send on an unsent order posts send', async () => {
    const view = order({ sent_at: null, state: 'Draft', actions: [action('send')] })
    const calls = stubApi(routesFor(view, { [`POST /refining/orders/${ORDER}/send`]: view }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('Draft sales order')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/send'))).toBe(true)
    )
  })

  test('Cancel with a confirm asks first, then posts cancel', async () => {
    const view = order({ actions: [action('cancel', 'two lots go back on hand')] })
    const calls = stubApi(routesFor(view, { [`POST /refining/orders/${ORDER}/cancel`]: view }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Two lots go back on hand/)).toBeTruthy()
    expect(calls.some((c) => c.url.pathname.endsWith('/cancel'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/cancel'))).toBe(
        true
      )
    )
  })

  test('choosing an assignee patches the order with expected_updated_at', async () => {
    const view = order()
    const calls = stubApi(routesFor(view, { [`PATCH /refining/orders/${ORDER}`]: view }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const trigger = await screen.findByRole('combobox', { name: 'Assigned to' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(await screen.findByRole('option', { name: 'Dana Whitlock' }), {
      key: 'Enter',
    })
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      assigned_to_id: ADMIN,
      expected_updated_at: view.updated_at,
    })
  })
})

describe('RefinerOrderScreen lots', () => {
  test('a combined row names its parents; Qty shows for bullion only', async () => {
    const combined = lot(1, {
      sources: [
        {
          id: '00000000-0000-4000-8000-000000000301',
          kind: 'batch',
          reference: null,
          content: 3,
          share: 1,
          order_reference: 'PO-2481',
          parents: [
            {
              lot_id: '00000000-0000-4000-8000-000000000501',
              order_id: '00000000-0000-4000-8000-0000000000a5',
              reference: 'Lot 2481-A',
              order_reference: 'PO-2481',
            },
            {
              lot_id: '00000000-0000-4000-8000-000000000502',
              order_id: '00000000-0000-4000-8000-0000000000a5',
              reference: 'Lot 2481-B',
              order_reference: 'PO-2481',
            },
          ],
        },
      ],
    })
    const view = order()
    stubApi(routesFor({ ...view, lots: [combined, view.lots[1]!] }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('Combined · 2481-A + 2481-B')).toBeTruthy()
    const table = screen.getByRole('table', { name: 'Lots' })
    expect(within(table).getByText('2')).toBeTruthy()
  })

  test('a pooled lot still shows its settled spot; a returned lot reads Returned', async () => {
    const view = order({
      settlement_type: 'pooled',
      lots: [
        lot(1, { settled_at: '2026-09-09T15:00:00Z', lotOver: { settled_spot: 2411.2 } }),
        lot(2, { returned_at: '2026-09-10T15:00:00Z' }),
      ],
    })
    stubApi(routesFor(view))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('$2,411.20')).toBeTruthy()
    expect(screen.getByText('Returned')).toBeTruthy()
  })

  test('editing a premium on a sent order patches the lot as a fraction', async () => {
    const view = order()
    const target = view.lots[0]!
    const calls = stubApi(routesFor(view, { [`PATCH /refining/lots/${target.id}`]: target.lot }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const input = await screen.findByRole('textbox', { name: 'Premium, 14K Gold' })
    fireEvent.change(input, { target: { value: '95' } })
    fireEvent.blur(input)
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      premium: 0.95,
      expected_updated_at: target.lot.updated_at,
    })
  })

  test('a draft shows lot figures as text', async () => {
    stubApi(routesFor(order({ sent_at: null, state: 'Draft' })))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect((await screen.findAllByText('92%')).length).toBe(2)
    expect(screen.queryByRole('textbox', { name: 'Premium, 14K Gold' })).toBeNull()
  })

  test('removing a selected lot releases its link', async () => {
    const view = order()
    const target = view.lots[0]!
    const calls = stubApi(routesFor(view, { [`DELETE /refining/lots/${target.id}`]: null }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select 14K Gold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected lots' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
  })
})

describe('RefinerOrderScreen money and documents', () => {
  test('pooled totals show ounces per metal and the dollar total', async () => {
    const view = order({
      settlement_type: 'pooled',
      expected_settlement: null,
      fine_oz: [
        {
          metal_id: 'Gold',
          estimated_content: 4.8,
          settled_content: 4.9,
          variance: 0.1,
          pool_oz: 4.5,
        },
        {
          metal_id: 'Silver',
          estimated_content: 39,
          settled_content: 39.1,
          variance: 0.1,
          pool_oz: 36.2,
        },
      ],
      totals: {
        fee: 706,
        pool_remediation: null,
        payment_charge: 20,
        shipping: 0,
        pool_oz_remediated: 0.003,
        total: -726,
      },
    })
    stubApi(routesFor(view))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const totals = (await screen.findAllByRole('region', { name: 'Totals' }))[0]!
    expect(within(totals).getByText('Gold credited')).toBeTruthy()
    expect(within(totals).getByText('4.500 oz')).toBeTruthy()
    expect(within(totals).getByText('Silver credited')).toBeTruthy()
    expect(within(totals).getAllByText('-$726.00').length).toBeGreaterThan(0)
  })

  test('a pooled sell has no bank block on its Payment card', async () => {
    stubApi(routesFor(order({ settlement_type: 'pooled', payment: null })))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const card = (await screen.findAllByRole('region', { name: 'Payment' }))[0]!
    expect(within(card).getByText('Pooled · no payment due')).toBeTruthy()
    expect(within(card).queryByText('Account name')).toBeNull()
  })

  test('refiner documents offer download and import, never send', async () => {
    stubApi(routesFor(order()))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByRole('button', { name: 'Download Refiner Invoice' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import Settlement' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Send Refiner Invoice/ })).toBeNull()
  })

  test('a purchase shows Spots read-only, with no unlock control', async () => {
    stubApi(routesFor(order({ direction: 'buy', number: 'RP-2493' })))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const spots = (await screen.findAllByRole('region', { name: 'Spots' }))[0]!
    expect(await within(spots).findByText('$2,411.20')).toBeTruthy()
    expect(within(spots).queryByRole('button', { name: /unlock/i })).toBeNull()
    expect(within(spots).queryByRole('textbox')).toBeNull()
  })
})
