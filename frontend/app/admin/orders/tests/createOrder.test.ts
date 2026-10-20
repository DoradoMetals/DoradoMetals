import { describe, expect, test } from 'vitest'
import { AdminOrderCreate, OrderPreviewBody, RefiningOrderCreate } from '@dorado/contracts'

import {
  emptyDrawerState,
  toCreateRequest,
  toPreviewBody,
  type DrawerState,
} from '../_lib/createOrder'

const CUSTOMER = '00000000-0000-4000-8000-0000000000c1'
const EMPLOYEE = '00000000-0000-4000-8000-0000000000e1'
const EAGLE = '00000000-0000-4000-8000-0000000000b1'
const METHOD = '00000000-0000-4000-8000-0000000000f1'
const SERVICE = '00000000-0000-4000-8000-0000000000f2'
const PACKAGE = '00000000-0000-4000-8000-0000000000f3'
const HOME = '00000000-0000-4000-8000-0000000000a1'
const LINK = '00000000-0000-4000-8000-0000000000d1'
const WIRE = '00000000-0000-4000-8000-0000000000d2'
const REFINER = '00000000-0000-4000-8000-000000000301'
const LOCATION = '00000000-0000-4000-8000-000000000302'
const LOT_A = '00000000-0000-4000-8000-0000000002a1'
const LOT_B = '00000000-0000-4000-8000-0000000002b1'
const DROPOFF = '00000000-0000-4000-8000-0000000000f9'

const scrapRow = {
  key: 'row-1',
  form: 'scrap' as const,
  metal_id: 'Gold',
  pre_melt: '12.40',
  unit: 'g',
  purity: '0.583',
  bullion_id: null,
  quantity: '',
  premium: '75',
}

const bullionRow = {
  key: 'row-2',
  form: 'bullion' as const,
  metal_id: null,
  pre_melt: '',
  unit: '',
  purity: '',
  bullion_id: EAGLE,
  quantity: '10',
  premium: null,
}

function purchase(over: Partial<DrawerState> = {}): DrawerState {
  return {
    ...emptyDrawerState('customer_purchase'),
    customer_id: CUSTOMER,
    assigned_to_id: EMPLOYEE,
    lots: [scrapRow, bullionRow],
    fulfillment: {
      method_id: METHOD,
      choices: {
        shipment: {
          carrier_service_id: SERVICE,
          package_id: PACKAGE,
          shipper_address_id: HOME,
          insured: true,
          additional_coverage: 40000,
        },
      },
    },
    payout: { method: 'ACH', bank_link_id: LINK },
    notes: '',
    ...over,
  }
}

describe('toCreateRequest for a customer purchase', () => {
  test('maps the rows to AdminOrderCreate lots, the override as a fraction, the rate as absent', () => {
    const request = toCreateRequest(purchase())
    expect(request.endpoint).toBe('orders')
    expect(request.body).toEqual({
      direction: 'purchase',
      user_id: CUSTOMER,
      assigned_to_id: EMPLOYEE,
      lots: [
        { metal_id: 'Gold', pre_melt: 12.4, purity: 0.583, unit: 'g', premium: 0.75 },
        { bullion_id: EAGLE, quantity: 10 },
      ],
      fulfillment: {
        method_id: METHOD,
        choices: {
          shipment: {
            carrier_service_id: SERVICE,
            package_id: PACKAGE,
            shipper_address_id: HOME,
            insured: true,
            additional_coverage: 40000,
          },
        },
      },
      payout: { method: 'ACH', bank_link_id: LINK },
    })
    expect(AdminOrderCreate.safeParse(request.body).success).toBe(true)
  })

  test('keeps a fractional percent exact', () => {
    const request = toCreateRequest(purchase({ lots: [{ ...bullionRow, premium: '103.5' }] }))
    expect(request.body).toMatchObject({
      lots: [{ bullion_id: EAGLE, quantity: 10, premium: 1.035 }],
    })
  })

  test('sends ids and inputs only: no names, no labels, no prices, no bank numbers', () => {
    const text = JSON.stringify(toCreateRequest(purchase()).body)
    expect(text).not.toMatch(/name|label|price|total|routing|account_number|estimate/)
  })

  test('an eCheck payout carries the method only', () => {
    const request = toCreateRequest(purchase({ payout: { method: 'ECHECK' } }))
    expect(request.body).toMatchObject({ payout: { method: 'ECHECK' } })
    expect((request.body as { payout: object }).payout).toEqual({ method: 'ECHECK' })
  })

  test('notes ride along only when typed', () => {
    expect(toCreateRequest(purchase({ notes: '  ' })).body).not.toHaveProperty('notes')
    expect(toCreateRequest(purchase({ notes: 'Ships Friday' })).body).toMatchObject({
      notes: 'Ships Friday',
    })
  })

  test('an empty order with Decide later omits fulfillment and payout', () => {
    const request = toCreateRequest(purchase({ lots: [], fulfillment: 'later', payout: 'later' }))
    expect(request.body).toEqual({
      direction: 'purchase',
      user_id: CUSTOMER,
      assigned_to_id: EMPLOYEE,
      lots: [],
    })
    expect(AdminOrderCreate.safeParse(request.body).success).toBe(true)
  })

  test('Decide later is refused once the order has lots', () => {
    expect(() => toCreateRequest(purchase({ fulfillment: 'later' }))).toThrow(/fulfillment/i)
    expect(() => toCreateRequest(purchase({ payout: 'later' }))).toThrow(/payout|transaction/i)
  })

  test('an unchosen assignee is left to auto-assign', () => {
    expect(toCreateRequest(purchase({ assigned_to_id: null })).body).not.toHaveProperty(
      'assigned_to_id'
    )
  })
})

describe('toCreateRequest for a customer sale', () => {
  test('carries the payment method and recipient address instead of a payout', () => {
    const state: DrawerState = {
      ...purchase(),
      kind: 'customer_sale',
      lots: [{ ...bullionRow, premium: '103.5' }],
      payout: null,
      payment_method_id: WIRE,
      recipient_address_id: HOME,
      fulfillment: {
        method_id: METHOD,
        choices: { shipment: { carrier_service_id: SERVICE, recipient_address_id: HOME } },
      },
    }
    const request = toCreateRequest(state)
    expect(request.endpoint).toBe('orders')
    expect(request.body).toEqual({
      direction: 'sale',
      user_id: CUSTOMER,
      assigned_to_id: EMPLOYEE,
      lots: [{ bullion_id: EAGLE, quantity: 10, premium: 1.035 }],
      fulfillment: {
        method_id: METHOD,
        choices: { shipment: { carrier_service_id: SERVICE, recipient_address_id: HOME } },
      },
      payment_method_id: WIRE,
      recipient_address_id: HOME,
    })
    expect(AdminOrderCreate.safeParse(request.body).success).toBe(true)
  })
})

describe('toCreateRequest for refiner orders', () => {
  const refiner = (kind: 'refiner_sale' | 'refiner_purchase', over: Partial<DrawerState> = {}) =>
    ({
      ...emptyDrawerState(kind),
      refiner_id: REFINER,
      settlement_type: 'pooled',
      location_id: LOCATION,
      assigned_to_id: EMPLOYEE,
      lot_ids: [LOT_A, LOT_B],
      fulfillment: {
        method_id: DROPOFF,
        choices: {
          dropoff: {
            refiner_id: REFINER,
            location_id: LOCATION,
            driver_employee_id: EMPLOYEE,
            start_time: '2026-06-18T18:00:00.000Z',
            end_time: '2026-06-18T20:00:00.000Z',
          },
        },
      },
      ...over,
    }) as DrawerState

  test('a Refiner Sale is RefiningOrderCreate with the selected lot ids, then its drop-off', () => {
    const request = toCreateRequest(refiner('refiner_sale'))
    expect(request.endpoint).toBe('refining')
    expect(request.body).toEqual({
      refiner_id: REFINER,
      direction: 'sell',
      settlement_type: 'pooled',
      location_id: LOCATION,
      assigned_to_id: EMPLOYEE,
      lot_ids: [LOT_A, LOT_B],
    })
    expect(RefiningOrderCreate.safeParse(request.body).success).toBe(true)
    expect(request.endpoint === 'refining' && request.fulfillment).toEqual({
      method_id: DROPOFF,
      choices: {
        dropoff: {
          refiner_id: REFINER,
          location_id: LOCATION,
          driver_employee_id: EMPLOYEE,
          start_time: '2026-06-18T18:00:00.000Z',
          end_time: '2026-06-18T20:00:00.000Z',
        },
      },
    })
  })

  test('a Refiner Sale with nothing selected omits lot_ids', () => {
    const request = toCreateRequest(refiner('refiner_sale', { lot_ids: [] }))
    expect(request.body).not.toHaveProperty('lot_ids')
  })

  test('a Refiner Purchase never sends lot ids (ruling 159)', () => {
    const request = toCreateRequest(refiner('refiner_purchase'))
    expect(request.body).toEqual({
      refiner_id: REFINER,
      direction: 'buy',
      settlement_type: 'pooled',
      location_id: LOCATION,
      assigned_to_id: EMPLOYEE,
    })
  })

  test('a refiner order with Decide later attaches no fulfillment', () => {
    const request = toCreateRequest(refiner('refiner_sale', { lot_ids: [], fulfillment: 'later' }))
    expect(request.endpoint === 'refining' && request.fulfillment).toBeNull()
  })
})

describe('toPreviewBody', () => {
  test('a customer purchase previews every complete row with its override', () => {
    const body = toPreviewBody(purchase())
    expect(body).toEqual({
      kind: 'customer_purchase',
      user_id: CUSTOMER,
      lots: [
        { metal_id: 'Gold', pre_melt: 12.4, purity: 0.583, unit: 'g', premium: 0.75 },
        { bullion_id: EAGLE, quantity: 10 },
      ],
    })
    expect(OrderPreviewBody.safeParse(body).success).toBe(true)
  })

  test('an incomplete row is left out until it can be priced', () => {
    const body = toPreviewBody(purchase({ lots: [{ ...scrapRow, pre_melt: '' }, bullionRow] }))
    expect(body).toMatchObject({ lots: [{ bullion_id: EAGLE, quantity: 10 }] })
  })

  test('a Refiner Sale previews its selected lots', () => {
    const state = { ...emptyDrawerState('refiner_sale'), lot_ids: [LOT_A] } as DrawerState
    expect(toPreviewBody(state)).toEqual({ kind: 'refiner_sale', lot_ids: [LOT_A] })
  })

  test('a Refiner Purchase has nothing to preview', () => {
    expect(toPreviewBody(emptyDrawerState('refiner_purchase'))).toBeNull()
  })

  test('a customer order with no customer chosen has nothing to preview yet', () => {
    expect(toPreviewBody(purchase({ customer_id: null }))).toBeNull()
  })
})
