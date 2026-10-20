import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { AdminOrderCreate, RefiningOrderCreate } from '@dorado/contracts'

import { emptyDrawerState, type DrawerState } from '../../_lib/createOrder'
import {
  IDS,
  desktop,
  drawer,
  mountDrawer,
  next,
  purchaseState,
  stubDrawerApi,
  writes,
  type Routes,
} from './createOrderFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/orders',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => desktop(true))
afterEach(() => vi.unstubAllGlobals())

const shipment = {
  method_id: IDS.carrierDropoff,
  choices: {
    shipment: {
      carrier_service_id: IDS.service,
      package_id: IDS.package,
      shipper_address_id: IDS.home,
    },
  },
}

const purchase = (over: Partial<DrawerState> = {}) =>
  purchaseState({
    assigned_to_id: IDS.owner,
    fulfillment: shipment,
    payout: { method: 'ACH', bank_link_id: IDS.link },
    ...over,
  })

async function toReview(initial: Partial<DrawerState>, routes: Routes = {}) {
  const hits = stubDrawerApi(routes)
  const mounted = mountDrawer({ initial })
  await next()
  await next()
  await next()
  const dialog = await drawer()
  await within(dialog).findByRole('heading', { name: 'Review' })
  return { hits, dialog, ...mounted }
}

const created = (hits: ReturnType<typeof stubDrawerApi>, path: string) =>
  hits.find((hit) => hit.method === 'POST' && hit.path === path)

describe('Review for a customer purchase', () => {
  test('headlines the payout total, lot count, fine content and the customer, all from the preview', async () => {
    const { dialog } = await toReview(purchase())
    expect(within(dialog).getByText('Payout total')).toBeTruthy()
    expect(await within(dialog).findByText('$24,066.04')).toBeTruthy()
    expect(within(dialog).getByText('2 lots')).toBeTruthy()
    expect(within(dialog).getByText('Lots · 10.232 t oz fine · Gold')).toBeTruthy()
    expect(within(dialog).getByText('Customer purchase · Jacob Johnson')).toBeTruthy()
    expect(within(dialog).getByText('Marguerite Whitfield')).toBeTruthy()
  })

  test('lists the lots with the preview estimate per row and the premium as a percent', async () => {
    const { dialog } = await toReview(purchase())
    expect(await within(dialog).findByText('$420.60')).toBeTruthy()
    expect(within(dialog).getByText('$23,645.44')).toBeTruthy()
    expect(within(dialog).getByText('75%')).toBeTruthy()
    expect(within(dialog).getByText('98%')).toBeTruthy()
    expect(within(dialog).getByText('1 oz Gold American Eagle')).toBeTruthy()
  })

  test('the Transaction card shows the method, payout account and the locked spot from the preview', async () => {
    const { dialog } = await toReview(purchase())
    expect(await within(dialog).findByText('Chase · Marguerite Whitfield · ···· 4417')).toBeTruthy()
    expect(within(dialog).getByText(/\$2,412\.80 \/ t oz/)).toBeTruthy()
    expect(within(dialog).getByText('Shipment')).toBeTruthy()
    expect(within(dialog).getByText('Carrier drop-off')).toBeTruthy()
  })

  test('each card has an Edit link back to its step', async () => {
    const { dialog } = await toReview(purchase())
    const edits = within(dialog).getAllByRole('button', { name: /^Edit/ })
    expect(edits).toHaveLength(3)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit fulfillment' }))
    expect(await within(dialog).findByText('How does the metal come in?')).toBeTruthy()
  })

  test('Create order posts the exact AdminOrderCreate body, ids only, and hands back the new order', async () => {
    const { dialog, hits, onCreated } = await toReview(purchase())
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Notes' }), {
      target: { value: 'Called in, ships Friday' },
    })
    expect(writes(hits)).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create order' }))

    await waitFor(() => expect(created(hits, '/orders/admin')).toBeTruthy())
    const body = created(hits, '/orders/admin')!.body
    expect(body).toEqual({
      direction: 'purchase',
      user_id: IDS.customer,
      assigned_to_id: IDS.owner,
      lots: [
        { metal_id: 'Gold', pre_melt: 12.4, purity: 0.583, unit: 'g' },
        { bullion_id: IDS.eagle, quantity: 10 },
      ],
      fulfillment: shipment,
      payout: { method: 'ACH', bank_link_id: IDS.link },
      notes: 'Called in, ships Friday',
    })
    expect(AdminOrderCreate.safeParse(body).success).toBe(true)
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ kind: 'customer_purchase', id: IDS.created })
    )
    expect(writes(hits)).toHaveLength(1)
  })

  test('Creating… disables Back and Create while the request is in flight', async () => {
    let release: (value: unknown) => void = () => {}
    const { dialog } = await toReview(purchase(), {
      'POST /orders/admin': () =>
        new Promise((resolve) => {
          release = resolve
        }),
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create order' }))
    const creating = await within(dialog).findByRole('button', { name: 'Creating…' })
    expect(creating.hasAttribute('disabled')).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true)
    release({ status: 201, body: { order: { id: IDS.created } } })
  })

  test("a refusal shows the API's message in the drawer alert and keeps the drawer open", async () => {
    const { dialog, onCreated, onOpenChange } = await toReview(purchase(), {
      'POST /orders/admin': {
        status: 422,
        body: { error: { message: 'Payout account is required.' } },
      },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create order' }))
    const alert = await within(dialog).findByRole('alert')
    expect(within(alert).getByText('Could not create the order')).toBeTruthy()
    expect(within(alert).getByText(/Payout account is required\./)).toBeTruthy()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(
      within(dialog).getByRole('button', { name: 'Create order' }).hasAttribute('disabled')
    ).toBe(false)
  })

  test('an empty order created with Decide later sends neither fulfillment nor payout', async () => {
    const { dialog, hits } = await toReview(
      purchase({ lots: [], fulfillment: 'later', payout: 'later' })
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create order' }))
    await waitFor(() => expect(created(hits, '/orders/admin')).toBeTruthy())
    expect(created(hits, '/orders/admin')!.body).toEqual({
      direction: 'purchase',
      user_id: IDS.customer,
      assigned_to_id: IDS.owner,
      lots: [],
    })
  })
})

describe('Review for a customer sale', () => {
  test('headlines the charge total and shows credit applied and due after credit from the preview', async () => {
    const { dialog, hits } = await toReview({
      ...emptyDrawerState('customer_sale'),
      customer_id: IDS.customer,
      assigned_to_id: IDS.owner,
      lots: purchaseState().lots!.slice(1),
      fulfillment: {
        method_id: IDS.dropship,
        choices: { shipment: { carrier_service_id: IDS.service, recipient_address_id: IDS.home } },
      },
      payment_method_id: IDS.saleWire,
      recipient_address_id: IDS.home,
    })
    expect(within(dialog).getByText('Charge total')).toBeTruthy()
    expect((await within(dialog).findAllByText('$24,972.48')).length).toBeGreaterThan(0)
    expect(within(dialog).getByText('$412.90')).toBeTruthy()
    expect(within(dialog).getByText('$24,559.58')).toBeTruthy()
    expect(within(dialog).getByText('Lock at placement')).toBeTruthy()
    expect(within(dialog).getByText('103.5%')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create order' }))
    await waitFor(() => expect(created(hits, '/orders/admin')).toBeTruthy())
    const body = created(hits, '/orders/admin')!.body
    expect(body).toEqual({
      direction: 'sale',
      user_id: IDS.customer,
      assigned_to_id: IDS.owner,
      lots: [{ bullion_id: IDS.eagle, quantity: 10 }],
      fulfillment: {
        method_id: IDS.dropship,
        choices: { shipment: { carrier_service_id: IDS.service, recipient_address_id: IDS.home } },
      },
      payment_method_id: IDS.saleWire,
      recipient_address_id: IDS.home,
    })
    expect(AdminOrderCreate.safeParse(body).success).toBe(true)
  })
})

describe('Review for a Refiner Sale', () => {
  const dropoff = {
    method_id: IDS.dropoff,
    choices: {
      dropoff: {
        refiner_id: IDS.refiner,
        location_id: IDS.keller,
        driver_employee_id: IDS.employee,
        start_time: '2026-06-18T18:00:00.000Z',
        end_time: '2026-06-18T20:00:00.000Z',
      },
    },
  }
  const refinerSale = {
    ...emptyDrawerState('refiner_sale'),
    refiner_id: IDS.refiner,
    settlement_type: 'pooled',
    location_id: IDS.austin,
    assigned_to_id: IDS.owner,
    lot_ids: [IDS.lotA, IDS.lotB],
    fulfillment: dropoff,
  } as Partial<DrawerState>

  test('headlines settlement after assay, the lots and the refiner', async () => {
    const { dialog } = await toReview(refinerSale)
    expect(within(dialog).getByText('After assay')).toBeTruthy()
    expect(within(dialog).getByText('2 lots')).toBeTruthy()
    expect(await within(dialog).findByText('Lots · 3.950 t oz fine · Gold')).toBeTruthy()
    expect(within(dialog).getByText('Refiner sale · Jacob Johnson')).toBeTruthy()
    expect(within(dialog).getByText('Asahi Refining')).toBeTruthy()
    expect(within(dialog).getByText('$5,102.40')).toBeTruthy()
  })

  test('Create posts RefiningOrderCreate with the lot ids, then attaches the drop-off', async () => {
    const { dialog, hits, onCreated } = await toReview(refinerSale)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create order' }))
    await waitFor(() => expect(created(hits, '/refining/orders')).toBeTruthy())
    const body = created(hits, '/refining/orders')!.body
    expect(body).toEqual({
      refiner_id: IDS.refiner,
      direction: 'sell',
      settlement_type: 'pooled',
      location_id: IDS.austin,
      assigned_to_id: IDS.owner,
      lot_ids: [IDS.lotA, IDS.lotB],
    })
    expect(RefiningOrderCreate.safeParse(body).success).toBe(true)
    await waitFor(() =>
      expect(created(hits, '/fulfillments')?.body).toEqual({
        refining_order_id: IDS.created,
        method_id: IDS.dropoff,
      })
    )
    await waitFor(() =>
      expect(
        hits.find(
          (hit) => hit.method === 'PATCH' && hit.path === `/fulfillments/${IDS.fulfillment}`
        )?.body
      ).toEqual(dropoff.choices)
    )
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ kind: 'refiner_sale', id: IDS.created })
    )
  })

  test('a 409 from a second open sale lands in the drawer alert', async () => {
    const { dialog } = await toReview(refinerSale, {
      'POST /refining/orders': {
        status: 409,
        body: {
          error: {
            message: 'refiner order RS-2493 is already open for this refiner - add the lots to it',
          },
        },
      },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create order' }))
    const alert = await within(dialog).findByRole('alert')
    expect(within(alert).getByText(/RS-2493 is already open/)).toBeTruthy()
  })
})

describe('Review for a Refiner Purchase', () => {
  test('Create posts RefiningOrderCreate with no lot ids (ruling 159)', async () => {
    const { dialog, hits } = await toReview({
      ...emptyDrawerState('refiner_purchase'),
      refiner_id: IDS.refiner,
      settlement_type: 'pooled',
      location_id: IDS.austin,
      assigned_to_id: IDS.owner,
      fulfillment: 'later',
    } as Partial<DrawerState>)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create order' }))
    await waitFor(() => expect(created(hits, '/refining/orders')).toBeTruthy())
    expect(created(hits, '/refining/orders')!.body).toEqual({
      refiner_id: IDS.refiner,
      direction: 'buy',
      settlement_type: 'pooled',
      location_id: IDS.austin,
      assigned_to_id: IDS.owner,
    })
    expect(created(hits, '/fulfillments')).toBeUndefined()
  })
})
