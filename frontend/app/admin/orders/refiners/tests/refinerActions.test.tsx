import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { OrderSearch } from '../../_components/OrderSearch'
import { RefinerOrderScreen } from '../_components'
import {
  LOCATION,
  ORDER,
  ORG,
  REFINER,
  action,
  desktop,
  lot,
  order,
  routesFor,
  stubApi,
} from './fixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/admin/orders/refiners/${ORDER}`,
  useSearchParams: () => new URLSearchParams(),
}))

const wrap = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

const failWith = (key: string, status: number) => {
  const inner = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const hit = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}` === key
      const answer = await inner(input, init)
      return hit ? new Response(JSON.stringify({ error: 'stale' }), { status }) : answer
    })
  )
}

const refiners = [
  {
    id: REFINER,
    logo: null,
    created_at: null,
    updated_at: null,
    organization: { id: ORG, name: 'Elemetal Refining', email: null, phone: null, enabled: true },
  },
]

const locations = [
  {
    id: LOCATION,
    address_id: LOCATION,
    image_id: null,
    organization_id: ORG,
    name: 'Dallas',
    type: null,
    enabled: true,
    label_company_name: null,
    label_phone_number: null,
    default_return: false,
    carrier_location_code: null,
    line_1: '1200 Regal Row',
    city: 'Dallas',
    state: 'TX',
  },
]

beforeEach(() => desktop(true))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RefinerOrderScreen stale saves', () => {
  test('a 409 on a lot patch says the order changed', async () => {
    const view = order()
    const target = view.lots[0]!
    stubApi(routesFor(view, { [`PATCH /refining/lots/${target.id}`]: target.lot }))
    failWith(`PATCH /refining/lots/${target.id}`, 409)
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const input = await screen.findByRole('textbox', { name: 'Premium, 14K Gold' })
    fireEvent.change(input, { target: { value: '90' } })
    fireEvent.blur(input)
    expect(await screen.findByText('This order changed since you opened it')).toBeTruthy()
  })

  test('a 409 on an order patch says the order changed', async () => {
    const view = order()
    stubApi(routesFor(view, { [`PATCH /refining/orders/${ORDER}`]: view }))
    failWith(`PATCH /refining/orders/${ORDER}`, 409)
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pooled' }))
    expect(await screen.findByText('This order changed since you opened it')).toBeTruthy()
  })

  test('any other failure says the change did not save', async () => {
    const view = order()
    const target = view.lots[0]!
    stubApi(routesFor(view))
    failWith(`DELETE /refining/lots/${target.id}`, 500)
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select 14K Gold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected lots' }))
    expect(await screen.findByText('That change did not save')).toBeTruthy()
  })
})

describe('RefinerOrderScreen settlement', () => {
  test('Record settlement with no selection settles every open lot', async () => {
    const view = order({
      lots: [lot(1, { settled_at: '2026-09-09T15:00:00Z' }), lot(2), lot(3)],
      settlement: { state: 'Partial', settled_lots: 1, lot_count: 3 },
    })
    const calls = stubApi(routesFor(view, { [`POST /refining/orders/${ORDER}/settle`]: view }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Record settlement' }))
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/settle'))).toBe(true))
    expect(calls.find((c) => c.url.pathname.endsWith('/settle'))!.body).toEqual({
      lots: [{ lot_id: view.lots[1]!.lot_id }, { lot_id: view.lots[2]!.lot_id }],
    })
  })

  test('a partial settle names only the selected lots and says the rest stay open', async () => {
    const view = order({
      actions: [
        action('edit_lots'),
        action('settle', '1 of 2 lots has no figures'),
        action('cancel'),
      ],
    })
    const calls = stubApi(routesFor(view, { [`POST /refining/orders/${ORDER}/settle`]: view }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select 14K Gold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record settlement' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settle RS-2493?' })
    expect(within(dialog).getByText(/1 of 2 open lots are marked settled/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Settle' }))
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/settle'))).toBe(true))
    expect(calls.find((c) => c.url.pathname.endsWith('/settle'))!.body).toEqual({
      lots: [{ lot_id: view.lots[0]!.lot_id }],
    })
  })

  test('a partial order reads N of M settled with the settled amount', async () => {
    const view = order({
      lots: [lot(1, { settled_at: '2026-09-09T15:00:00Z' }), lot(2)],
      settlement: { state: 'Partial', settled_lots: 1, lot_count: 2 },
    })
    stubApi(routesFor(view))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const card = (await screen.findAllByRole('region', { name: 'Settlement' }))[0]!
    expect(await within(card).findByText('1 of 2 settled')).toBeTruthy()
    expect(within(card).getByText('Pending on 1 lot')).toBeTruthy()
  })

  test('a pending sell shows no lot price until the lot settles', async () => {
    const view = order({
      lots: [
        lot(1, { settled_at: '2026-09-09T15:00:00Z', lotOver: { settled_spot: 2411.2 } }),
        lot(2),
      ],
    })
    stubApi(routesFor(view))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const table = await screen.findByRole('table', { name: 'Lots' })
    expect(await within(table).findByText('$5,102.40')).toBeTruthy()
    expect(within(table).queryByText('$5,103.40')).toBeNull()
  })

  test('Resolve dispute confirms, then clears disputed_at with expected_updated_at', async () => {
    const view = order({
      disputed_at: '2026-10-02T15:00:00Z',
      dispute_note: 'Our XRF reads 58.3% on 2481-A.',
      state: 'Disputed',
      settlement: { state: 'Disputed', settled_lots: 0, lot_count: 2 },
      actions: [action('resolve_dispute', 'the order goes back to settlement')],
    })
    const calls = stubApi(routesFor(view, { [`PATCH /refining/orders/${ORDER}`]: view }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('Assay disputed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resolve dispute' }))
    const dialog = await screen.findByRole('dialog', { name: 'Resolve the dispute on RS-2493?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve dispute' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      disputed_at: null,
      expected_updated_at: view.updated_at,
    })
  })

  test('a cancelled order reads Cancelled and its lots are back on hand', async () => {
    const view = order({
      cancelled_at: '2026-09-06T15:00:00Z',
      state: 'Cancelled',
      settlement: { state: 'Cancelled', settled_lots: 0, lot_count: 0 },
      lots: [lot(1, { released_at: '2026-09-06T15:00:00Z' })],
      actions: [],
    })
    stubApi(routesFor(view))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('Batch cancelled')).toBeTruthy()
    expect(screen.getByText(/back on hand/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})

describe('RefinerOrderScreen header actions', () => {
  test('Cancel asks first even when the API sends no confirm', async () => {
    const view = order({ actions: [action('cancel')] })
    const calls = stubApi(routesFor(view, { [`POST /refining/orders/${ORDER}/cancel`]: view }))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cancel RS-2493?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep order' }))
    expect(calls.some((c) => c.url.pathname.endsWith('/cancel'))).toBe(false)
  })

  test('Edit changes the location and patches with expected_updated_at', async () => {
    const view = order()
    const calls = stubApi(
      routesFor(view, {
        [`PATCH /refining/orders/${ORDER}`]: view,
        'GET /suppliers/get_all': refiners,
        'GET /locations': locations,
      })
    )
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Location' }), { key: 'Enter' })
    fireEvent.keyDown(await screen.findByRole('option', { name: 'Dallas · 1200 Regal Row' }), {
      key: 'Enter',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      refiner_id: REFINER,
      location_id: LOCATION,
      expected_updated_at: view.updated_at,
    })
  })

  test('no Edit once the order is closed', async () => {
    stubApi(
      routesFor(order({ settled_at: '2026-09-09T15:00:00Z', actions: [action('lock_ounces')] }))
    )
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('Elemetal Refining')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
})

describe('RefinerOrderScreen documents', () => {
  test('importing the settlement opens the Match settlement lines drawer', async () => {
    const view = order()
    const calls = stubApi(
      routesFor(view, {
        [`POST /refining/orders/${ORDER}/documents/settlement`]: {
          kind: 'settlement',
          name: 'Settlement',
          available: true,
          pdf_id: null,
          size_bytes: 1000,
          created_at: null,
          created_by_id: null,
        },
        [`POST /refining/orders/${ORDER}/settlement-lines/parse`]: {
          format: 'elemetal',
          supported: true,
          lines: [],
          not_on_invoice: [],
        },
      })
    )
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Import Settlement' }))
    const file = new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Import document'), { target: { files: [file] } })
    await waitFor(() =>
      expect(calls.some((c) => c.url.pathname.endsWith('/documents/settlement'))).toBe(true)
    )
    expect(await screen.findByRole('dialog', { name: 'Match settlement lines' })).toBeTruthy()
  })

  test('a failed import shows the save error', async () => {
    stubApi(routesFor(order()))
    failWith(`POST /refining/orders/${ORDER}/documents/settlement`, 500)
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Import Settlement' }))
    const file = new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Import document'), { target: { files: [file] } })
    expect(await screen.findByText('That change did not save')).toBeTruthy()
  })
})

describe('RefinerOrderScreen cards', () => {
  test('Charges shows derived figures as text, never inputs', async () => {
    stubApi(routesFor(order()))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const card = (await screen.findAllByRole('region', { name: 'Charges' }))[0]!
    expect(within(card).getByText('Payment Charge')).toBeTruthy()
    expect(within(card).getByText('$20.00')).toBeTruthy()
    expect(within(card).getByText('Pool Oz Remediated')).toBeTruthy()
    expect(within(card).queryByRole('textbox')).toBeNull()
  })

  test('a purchase Payment card shows method and pay to', async () => {
    const view = order({
      direction: 'buy',
      number: 'RP-2493',
      payment: {
        order_id: null,
        refining_order_id: ORDER,
        number: 2493,
        direction: 'buy',
        amount_due: 13346.09,
        transfer_id: null,
        kind: null,
        rail: null,
        state: 'Not sent',
        amount: null,
        reference: null,
        failure_reason: null,
        provider: null,
        provider_ref: null,
        sent_at: null,
        completed_at: null,
        pay_to: {
          id: LOCATION,
          rail: 'WIRE',
          bank_name: 'Chase',
          holder_name: 'Elemetal Refining LLC',
          last_four: '4417',
          status: 'verified',
          payment_method_id: null,
        },
        payout_account: null,
      },
    })
    stubApi(routesFor(view))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const card = (await screen.findAllByRole('region', { name: 'Payment' }))[0]!
    expect(within(card).getByText('Not sent')).toBeTruthy()
    expect(within(card).getByText('Elemetal Refining LLC')).toBeTruthy()
    expect(within(card).getByText('Chase · •••• 4417')).toBeTruthy()
    expect(within(card).getByText('$13,346.09')).toBeTruthy()
  })

  test('a purchase lists its linked sales orders', async () => {
    const view = order({
      direction: 'buy',
      number: 'RP-2493',
      linked_orders: [
        {
          id: '00000000-0000-4000-8000-0000000000b1',
          number: 1112,
          direction: 'sale',
          reference: 'SO-1112',
          customer_name: 'Marguerite Whitfield',
          city: 'Austin, TX',
          stage: 'Label Created',
        },
      ],
    })
    stubApi(routesFor(view))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const card = (await screen.findAllByRole('region', { name: 'Fulfillment' }))[0]!
    expect(within(card).getByRole('link', { name: 'SO-1112' })).toBeTruthy()
    expect(within(card).getByText('Elemetal Refining · Dallas, TX')).toBeTruthy()
  })

  test('mobile stacks Settlement first and draws lots as cards', async () => {
    desktop(false)
    stubApi(routesFor(order()))
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    const settlement = (await screen.findAllByRole('region', { name: 'Settlement' }))[0]!
    const lots = screen.getAllByRole('region', { name: 'Lots' })[0]!
    expect(lots.getAttribute('data-layout')).toBe('mobile')
    expect(settlement.compareDocumentPosition(lots) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('a failed read offers a retry', async () => {
    stubApi({})
    wrap(<RefinerOrderScreen orderId={ORDER} />)
    expect(await screen.findByText('Couldn’t load this refiner order')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('OrderSearch', () => {
  test('a refiner order hit links to its refiner screen', async () => {
    stubApi({
      'GET /search': [
        { kind: 'refining_order', id: ORDER, reference: 'RS-2493', title: 'Elemetal Refining' },
      ],
    })
    wrap(<OrderSearch value="rs2493" onValueChange={() => {}} q="rs2493" mobile={false} />)
    const link = await screen.findByRole('link', { name: /RS-2493/ })
    expect(link.getAttribute('href')).toBe(`/admin/orders/refiners/${ORDER}`)
  })
})
