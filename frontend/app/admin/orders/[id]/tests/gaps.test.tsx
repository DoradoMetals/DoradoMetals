import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { OrderView } from '@dorado/contracts'

import { OrderScreen } from '../_components'
import { scrapLot } from '../_components/tests/detailFixtures'
import { desktop } from '../../tests/fixtures'
import { ORDER_ID, act, orderView, stubOrder } from './screenFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/admin/orders/${ORDER_ID}`,
  useSearchParams: () => new URLSearchParams(),
}))

const DETAILS = '00000000-0000-4000-8000-0000000000e1'
const DISPUTE = '00000000-0000-4000-8000-0000000000d1'

const wrap = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrderScreen orderId={ORDER_ID} />
    </QueryClientProvider>
  )

const card = (name: string) => screen.getByTestId(`order-card-${name}`)

beforeEach(() => desktop(true))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OrderScreen gaps', () => {
  test('Notes takes a note with no action offered', async () => {
    const calls = stubOrder(orderView('purchase'), { [`POST /orders/${ORDER_ID}/notes`]: {} })
    wrap()
    const box = await within(await screen.findByTestId('order-card-notes')).findByLabelText('Note')
    fireEvent.change(box, { target: { value: 'Called the customer' } })
    fireEvent.click(within(card('notes')).getByRole('button', { name: 'Add note' }))
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/notes'))).toBe(true)
    )
    expect(
      calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/notes'))!.body
    ).toEqual({ body: 'Called the customer' })
  })

  test('a frozen bid is set from the Spots card through the override dialog', async () => {
    const view = orderView('purchase', {
      order: { ...orderView('purchase').order, spots_locked: true },
      actions: [
        act('edit_spots', { override: 'Setting a frozen bid by hand reprices order 2481' }),
      ],
    })
    const calls = stubOrder(view, { [`PUT /orders/${ORDER_ID}/spots`]: [] })
    wrap()
    const field = (await within(await screen.findByTestId('order-card-spots')).findByLabelText(
      'Gold'
    )) as HTMLInputElement
    await waitFor(() => expect(field.readOnly).toBe(false))
    fireEvent.change(field, { target: { value: '2500' } })
    fireEvent.blur(field)
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Matched the dealer quote' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set bid' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      set: [{ metal_id: 'Gold', bid: 2500 }],
      reason: 'Matched the dealer quote',
    })
  })

  test('the payout charge edits the payout details when edit_charges is offered', async () => {
    const view = orderView('purchase', {
      totals: { payout_details_id: DETAILS } as OrderView['totals'],
      actions: [act('edit_charges')],
    })
    const calls = stubOrder(view, { [`PATCH /payments/details/${DETAILS}`]: {} })
    wrap()
    const field = (await within(await screen.findByTestId('order-card-charges')).findByLabelText(
      'Payout Charge'
    )) as HTMLInputElement
    await waitFor(() => expect(field.readOnly).toBe(false))
    expect(
      (within(card('charges')).getByLabelText('Shipping Charge') as HTMLInputElement).readOnly
    ).toBe(true)
    fireEvent.change(field, { target: { value: '7' } })
    fireEvent.blur(field)
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ cost: 7 })
  })

  test('Resolve on a purity dispute asks for the resolution, then patches it', async () => {
    const view = orderView('purchase', {
      cases: { claims: 0, open_claims: 0, open_disputes: 1 },
      actions: [act('resolve_dispute')],
    })
    const calls = stubOrder(view, {
      [`GET /orders/${ORDER_ID}/disputes`]: [
        {
          id: DISPUTE,
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
      [`PATCH /orders/disputes/${DISPUTE}`]: {},
    })
    wrap()
    const resolve = await within(await screen.findByTestId('order-card-dispute')).findByRole(
      'button',
      { name: 'Resolve' }
    )
    await waitFor(() => expect((resolve as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(resolve)
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Resolution'), {
      target: { value: 'Kept our assay' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ resolution: 'Kept our assay' })
  })

  test('Remove lots unlinks the selected lot with the reason', async () => {
    const view = orderView('purchase', {
      actions: [act('remove_lots', { confirm: 'The lot row is kept' })],
    })
    const calls = stubOrder(view, { [`POST /orders/lots/${scrapLot.id}/unlink`]: [] })
    wrap()
    fireEvent.click(
      await within(await screen.findByTestId('order-card-lots')).findByLabelText('Select all lots')
    )
    fireEvent.click(within(card('lots')).getByRole('button', { name: 'Remove lots' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('The lot row is kept')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Merged at intake bench' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/unlink'))).toBe(true))
    expect(calls.find((c) => c.url.pathname.endsWith('/unlink'))!.body).toEqual({
      reason: 'Merged at intake bench',
    })
  })

  test('Add lot opens the declare row on a purchase and the stock search on a sale', async () => {
    stubOrder(orderView('purchase', { actions: [act('add_lot')] }), {
      'GET /spots': { spots: [], paused: [], market_open: true, next_market_open: null },
    })
    const first = wrap()
    const add = await within(await screen.findByTestId('order-card-lots')).findByRole('button', {
      name: 'Add lot',
    })
    fireEvent.click(add)
    expect(card('lots').querySelector('[data-mode="declare"]')).toBeTruthy()
    first.unmount()
    vi.unstubAllGlobals()

    stubOrder(orderView('sale', { actions: [act('add_lot')] }))
    wrap()
    fireEvent.click(
      await within(await screen.findByTestId('order-card-lots')).findByRole('button', {
        name: 'Add lot',
      })
    )
    expect(card('lots').querySelector('[data-mode="stock"]')).toBeTruthy()
    expect(within(card('lots')).getByLabelText('Find lot')).toBeTruthy()
  })
})
