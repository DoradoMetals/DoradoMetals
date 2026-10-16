import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { OrderView } from '@dorado/contracts'

import { OrderScreen } from '../_components'
import { desktop } from '../../tests/fixtures'
import { ORDER_ID, act, orderView, stubOrder } from './screenFixtures'
import { scrapLot } from '../_components/tests/detailFixtures'
import { payment } from '../_components/tests/cardFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/admin/orders/${ORDER_ID}`,
  useSearchParams: () => new URLSearchParams(),
}))

const wrap = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrderScreen orderId={ORDER_ID} />
    </QueryClientProvider>
  )
}

const cardsIn = (testId: string) =>
  Array.from(screen.getByTestId(testId).querySelectorAll('[data-testid^="order-card-"]')).map(
    (node) => node.getAttribute('data-testid')!.replace('order-card-', '')
  )

beforeEach(() => desktop(true))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OrderScreen composition', () => {
  test('a purchase draws the PO-2481 columns in frame order', async () => {
    stubOrder(orderView('purchase'))
    wrap()
    expect(await screen.findByTestId('order-main')).toBeTruthy()
    expect(screen.getByTestId('order-screen').getAttribute('data-direction')).toBe('purchase')
    expect(cardsIn('order-main')).toEqual([
      'fulfillment',
      'spots',
      'lots',
      'lot-photos',
      'charges',
      'payment',
      'activity',
    ])
    expect(cardsIn('order-aside')).toEqual(['totals', 'profit', 'documents', 'chat', 'notes'])
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByText('PO-2481')).toBeTruthy()
    expect(within(crumbs).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/admin')
    expect(within(crumbs).getByRole('link', { name: 'Orders' }).getAttribute('href')).toBe(
      '/admin/orders'
    )
    expect(within(crumbs).queryByRole('link', { name: 'PO-2481' })).toBeNull()
  })

  test('a sale draws the SO-1112 columns and drops the profit breakdown', async () => {
    stubOrder(orderView('sale'))
    wrap()
    expect(await screen.findByTestId('order-main')).toBeTruthy()
    expect(cardsIn('order-main')).toEqual([
      'fulfillment',
      'address-change',
      'spots',
      'lots',
      'charges',
      'payment',
      'refunds',
      'claim',
      'activity',
    ])
    expect(cardsIn('order-aside')).toEqual(['totals', 'documents', 'chat', 'notes'])
  })

  test('an open purity dispute sits under the lots', async () => {
    const view = orderView('purchase')
    stubOrder(view, {
      [`GET /orders/${ORDER_ID}/disputes`]: [
        {
          id: '00000000-0000-4000-8000-0000000000d1',
          order_id: ORDER_ID,
          lot_id: view.lots[0].lot_id,
          our_purity: 0.563,
          claimed_purity: 0.54,
          claim_source: 'Refiner',
          reason: 'Refiner assay reads lower',
          resolution: null,
          resolved_at: null,
          resolved_by_id: null,
          created_at: '2026-10-01T10:00:00.000Z',
          updated_at: '2026-10-01T10:00:00.000Z',
          created_by_id: null,
          updated_by_id: null,
        },
      ],
    })
    wrap()
    await waitFor(() => expect(cardsIn('order-main')).toContain('dispute'))
    expect(cardsIn('order-main').slice(2, 4)).toEqual(['lots', 'dispute'])
  })

  test('at 390 the cards stack in one column', async () => {
    desktop(false)
    stubOrder(orderView('purchase'))
    wrap()
    const main = await screen.findByTestId('order-main')
    expect(screen.getByTestId('order-screen').getAttribute('data-layout')).toBe('mobile')
    expect(main.parentElement!.className).not.toContain('grid-cols')
  })

  test('a card that fails to load fails alone', async () => {
    stubOrder(orderView('purchase'))
    vi.stubGlobal(
      'fetch',
      ((original: typeof fetch) =>
        vi.fn((input: string | URL | Request, init?: RequestInit) =>
          String(input).includes('/quotes/order')
            ? Promise.resolve(new Response(JSON.stringify({ message: 'down' }), { status: 500 }))
            : original(input, init)
        ))(globalThis.fetch)
    )
    wrap()
    expect(await screen.findByText('Couldn’t load spots')).toBeTruthy()
    expect(screen.getAllByText('14 Karat Gold').length).toBeGreaterThan(0)
  })

  test('the order read failing shows one retry', async () => {
    stubOrder(orderView('purchase'), { [`GET /orders/${ORDER_ID}`]: undefined })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'down' }), { status: 500 }))
    )
    wrap()
    expect(await screen.findByText('Couldn’t load this order')).toBeTruthy()
  })
})

describe('OrderScreen actions', () => {
  test('a confirm-class action shows the server text, then runs', async () => {
    const calls = stubOrder(
      orderView('purchase', {
        actions: [act('finalize', { confirm: 'Refiner has not settled 1 of 5 lots' })],
      }),
      { [`POST /orders/${ORDER_ID}/finalize`]: orderView('purchase') }
    )
    wrap()
    fireEvent.click(await screen.findByRole('button', { name: 'Finalize' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Refiner has not settled 1 of 5 lots')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finalize' }))
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/finalize'))).toBe(
        true
      )
    )
  })

  test('an action with neither class runs at once', async () => {
    const calls = stubOrder(orderView('purchase', { actions: [act('lock_spots')] }), {
      [`PUT /orders/${ORDER_ID}/spots`]: [],
    })
    wrap()
    const lock = await screen.findByRole('button', { name: 'Lock spots' })
    await waitFor(() => expect((lock as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(lock)
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ lock: true })
  })

  test('an override-class action takes a reason, steps up, then runs', async () => {
    const view = orderView('sale', {
      payment: { received: 25, refunded: 0, refundable: 25, credit: 0, charge_received: true },
      actions: [act('refund', { override: "Up to 25.00 can go back to the customer's card" })],
    })
    const calls = stubOrder(
      view,
      {
        'POST /account/step_up': {
          purpose: 'step_up',
          channel: 'email',
          destination: 'a•••@example.invalid',
          code_length: 6,
          expires_at: '2026-10-15T10:10:00.000Z',
          resend_at: null,
          attempts_remaining: 5,
          locked_until: null,
          status: 'sent',
        },
        'POST /account/verify_code': {
          purpose: 'step_up',
          channel: 'email',
          destination: 'a•••@example.invalid',
          code_length: 6,
          expires_at: '2026-10-15T10:10:00.000Z',
          resend_at: null,
          attempts_remaining: 5,
          locked_until: null,
          status: 'verified',
        },
        [`POST /orders/${ORDER_ID}/refunds`]: [],
      },
      false
    )
    wrap()
    fireEvent.click(await screen.findByRole('button', { name: 'Refund' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText("Up to 25.00 can go back to the customer's card")).toBeTruthy()
    const amount = within(dialog).getByLabelText('Amount') as HTMLInputElement
    expect(amount.value).toBe('25.00')
    fireEvent.change(amount, { target: { value: '10' } })
    fireEvent.blur(amount)
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Customer returned a damaged coin' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refund' }))
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/step_up'))).toBe(true))
    fireEvent.change(await screen.findByLabelText('One-time code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/refunds'))).toBe(
        true
      )
    )
    const verifyCall = calls.find((c) => c.url.pathname.endsWith('/verify_code'))!
    expect(verifyCall.body).toEqual({ channel: 'email', code: '123456' })
    expect(
      calls.find((c) => c.url.pathname.endsWith('/refunds') && c.method === 'POST')!.body
    ).toEqual({
      amount: 10,
      reason: 'Customer returned a damaged coin',
    })
  })
})

describe('OrderScreen wiring', () => {
  test('the screen says ready once the order has loaded', async () => {
    stubOrder(orderView('purchase'))
    wrap()
    expect(await screen.findByTestId('order-main')).toBeTruthy()
    expect(screen.getByTestId('order-screen').getAttribute('data-state')).toBe('ready')
  })

  test('lock spots opens the confirm dialog with the server text before it runs', async () => {
    const calls = stubOrder(
      orderView('purchase', {
        actions: [
          act('lock_spots', { confirm: "Locking freezes today's spot bids on order 2481." }),
        ],
      }),
      { [`PUT /orders/${ORDER_ID}/spots`]: [] }
    )
    wrap()
    const lock = await screen.findByRole('button', { name: 'Lock spots' })
    await waitFor(() => expect((lock as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(lock)
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText("Locking freezes today's spot bids on order 2481.")
    ).toBeTruthy()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lock spots' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
  })

  test('a selected lot is removed through the unlink with its reason', async () => {
    const calls = stubOrder(
      orderView('purchase', { actions: [act('remove_lots', { confirm: 'The lot row is kept.' })] }),
      { [`POST /orders/lots/${scrapLot.lot_id}/unlink`]: [] }
    )
    wrap()
    fireEvent.click(await screen.findByRole('checkbox', { name: `Select ${scrapLot.name}` }))
    const remove = screen.getByRole('button', { name: 'Remove lots' })
    await waitFor(() => expect((remove as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(remove)
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Entered on the wrong order' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/unlink'))).toBe(
        true
      )
    )
    expect(calls.find((c) => c.url.pathname.endsWith('/unlink'))!.body).toEqual({
      reason: 'Entered on the wrong order',
    })
  })

  test('the address change leaves out the book address the order ships to, not its snapshot id', async () => {
    const address = {
      id: 'snapshot-1',
      source_address_id: 'book-1',
      line_1: '12 Elm St',
      city: 'Austin',
      state: 'TX',
    } as unknown as OrderView['address']
    stubOrder(orderView('sale', { address, actions: [act('change_address')] }), {
      'GET /addresses': [
        { address: { id: 'book-1', line_1: '12 Elm St', city: 'Austin', state: 'TX' } },
      ],
    })
    wrap()
    const card = await screen.findByTestId('order-card-address-change')
    fireEvent.click(within(card).getByRole('button', { name: /Address change/ }))
    expect(await within(card).findByText('No other address on file')).toBeTruthy()
  })

  test('Add note needs no API action and posts the note', async () => {
    const calls = stubOrder(orderView('purchase', { actions: [] }), {
      [`POST /orders/${ORDER_ID}/notes`]: {},
    })
    wrap()
    const card = await screen.findByTestId('order-card-notes')
    fireEvent.change(within(card).getByLabelText('Note'), {
      target: { value: 'Call before shipping' },
    })
    const add = within(card).getByRole('button', { name: 'Add note' })
    expect((add as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(add)
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/notes'))).toBe(true)
    )
    expect(
      calls.find((c) => c.url.pathname.endsWith('/notes') && c.method === 'POST')!.body
    ).toEqual({
      body: 'Call before shipping',
    })
  })
})

const FULFILLMENT_ID = '00000000-0000-4000-8000-0000000000f1'

const shipMethod = (direction: 'purchase' | 'sale', category = 'SHIPMENT', id = 'method-ship') => ({
  id,
  type: category,
  label: category,
  admin_label: null,
  category,
  direction,
  enabled: true,
  hidden: false,
  is_default: true,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
})

describe('OrderScreen drift fixes', () => {
  test('Create fulfillment opens the create card and posts only the fulfillment, never a label', async () => {
    const calls = stubOrder(orderView('purchase'), {
      'GET /fulfillments/methods': [shipMethod('purchase')],
      'POST /fulfillments': { fulfillment: { id: FULFILLMENT_ID } },
    })
    wrap()
    const card = await screen.findByTestId('order-card-fulfillment')
    fireEvent.click(await within(card).findByRole('button', { name: 'Create fulfillment' }))
    expect(await within(card).findByRole('tab', { name: 'Pickup' })).toBeTruthy()
    const submit = within(card).getByRole('button', {
      name: 'Create Shipment',
    }) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(false))
    fireEvent.click(submit)
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/fulfillments'))
      ).toBe(true)
    )
    expect(
      calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/fulfillments'))!.body
    ).toEqual({
      order_id: ORDER_ID,
      method_id: 'method-ship',
    })
    expect(calls.some((c) => c.url.pathname.endsWith('/label'))).toBe(false)
  })

  test('a sale offers only Shipment and Appointment', async () => {
    stubOrder(orderView('sale'), { 'GET /fulfillments/methods': [shipMethod('sale')] })
    wrap()
    const card = await screen.findByTestId('order-card-fulfillment')
    fireEvent.click(await within(card).findByRole('button', { name: 'Create fulfillment' }))
    const tabs = (await within(card).findAllByRole('tab')).map((tab) => tab.textContent)
    expect(tabs).toEqual(['Shipment', 'Appointment'])
  })

  test('a due sale on a bank rail shows the Matching search', async () => {
    stubOrder(orderView('sale'), {
      [`GET /payments/view/${ORDER_ID}`]: payment({ direction: 'sale', state: 'Due', rail: 'ACH' }),
      'GET /payments/inbound/candidates': [],
    })
    wrap()
    const card = await screen.findByTestId('order-card-payment')
    expect(await within(card).findByPlaceholderText('Search unmatched transactions…')).toBeTruthy()
  })

  test('a purchase payment has no Matching search', async () => {
    stubOrder(orderView('purchase'))
    wrap()
    const card = await screen.findByTestId('order-card-payment')
    await waitFor(() => expect(within(card).queryByText('Couldn’t load payment')).toBeNull())
    expect(within(card).queryByPlaceholderText('Search unmatched transactions…')).toBeNull()
  })

  test('a pickup card names its office, driver and pickup address', async () => {
    const view = orderView('purchase')
    stubOrder(view, {
      [`GET /orders/${ORDER_ID}/fulfillments`]: {
        fulfillment: {
          id: FULFILLMENT_ID,
          method_id: 'method-pickup',
          order_id: ORDER_ID,
          status: 'SCHEDULED',
          created_by: null,
          updated_by: null,
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
          created_by_id: null,
          updated_by_id: null,
          refining_order_id: null,
        },
        method: shipMethod('purchase', 'PICKUP', 'method-pickup'),
        pickup: {
          id: 'p-1',
          fulfillment_id: FULFILLMENT_ID,
          pickup_address_id: 'addr-1',
          assigned_employee_id: 'emp-1',
          start_time: '2026-10-20T15:00:00.000Z',
          end_time: '2026-10-20T17:00:00.000Z',
          location_id: 'loc-1',
        },
        direct: null,
        dropoff: null,
        shipments: [],
        parcel: null,
        scheduled_at: null,
        linked_order: null,
        missing: [],
        actions: {
          set_method: false,
          schedule: false,
          cancel_schedule: false,
          categories: [],
          transitions: [],
          moves: [],
        },
      },
      'GET /addresses': [
        { address: { id: 'addr-1', line_1: '12 Elm St', city: 'Austin', state: 'TX' } },
      ],
      'GET /locations': [{ id: 'loc-1', address_id: 'addr-9', name: 'Austin Office' }],
      'GET /employees': [
        { id: 'emp-1', user_id: 'u-1', role: 'driver', enabled: true, name: 'Dana Cole' },
      ],
    })
    wrap()
    const card = await screen.findByTestId('order-card-pickup')
    expect(await within(card).findByText('Austin Office')).toBeTruthy()
    expect(await within(card).findByText('Dana Cole')).toBeTruthy()
    expect(await within(card).findByText('12 Elm St, Austin, TX')).toBeTruthy()
  })
})
