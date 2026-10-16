import type { Action, Direction, OrderView, SessionView } from '@dorado/contracts'

import {
  ADMIN_ID,
  CUSTOMER_ID,
  ORDER_ID,
  bullionLot,
  profit,
  purchasePricing,
  salePricing,
  scrapLot,
  spot,
} from '../_components/tests/detailFixtures'
import { payment } from '../_components/tests/cardFixtures'
import { stubApi, type Routes } from '../../tests/fixtures'

export { ADMIN_ID, CUSTOMER_ID, ORDER_ID }

export const STAMP = '2026-10-15T10:00:00.000Z'

export const orderView = (direction: Direction, over: Partial<OrderView> = {}): OrderView => ({
  order: {
    id: ORDER_ID,
    user_id: CUSTOMER_ID,
    direction,
    number: direction === 'sale' ? 1112 : 2481,
    notes: null,
    review_created: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-09-01T16:00:00.000Z',
    updated_at: STAMP,
    created_by_id: null,
    updated_by_id: null,
    order_sent: null,
    tracking_updated: null,
    spots_locked: false,
    assigned_to_id: null,
    cancelled_at: null,
  },
  totals: null,
  lots: direction === 'sale' ? [bullionLot] : [scrapLot],
  address: null,
  shipments: [],
  pickup: null,
  payout: null,
  user: {
    id: CUSTOMER_ID,
    name: 'Marguerite Whitfield',
    email: 'm@example.invalid',
    orders_to_date: 7,
  },
  credited: false,
  reference: direction === 'sale' ? 'SO-1112' : 'PO-2481',
  state: direction === 'sale' ? 'Awaiting Payment' : 'Awaiting Finalize',
  payment: { received: 0, refunded: 0, refundable: 0, charge_received: false },
  adopt: { assayed_lots: 0, combining_lots: 0 },
  cases: { claims: 0, open_claims: 0, open_disputes: 0 },
  completed_at: null,
  payout_methods: [],
  actions: [],
  ...over,
})

export const session = (fresh: boolean): SessionView => ({
  user_id: ADMIN_ID,
  email: 'admin@example.invalid',
  phone_number: null,
  phone_number_verified: false,
  authenticated_at: STAMP,
  fresh,
  factor_changed: null,
})

export const act = (name: string, extra: Partial<Action> = {}): Action => ({
  name,
  confirm: null,
  override: null,
  ...extra,
})

export function stubOrder(view: OrderView, extra: Routes = {}, fresh = true) {
  const id = view.order.id
  const sale = view.order.direction === 'sale'
  return stubApi({
    [`GET /orders/${id}`]: view,
    'POST /quotes/order': {
      ...(sale ? salePricing : purchasePricing),
      spots: [spot('Gold', 2411.2, 2431.2)],
    },
    'POST /quotes/profit_breakdown': profit(),
    [`GET /orders/${id}/activity`]: [],
    [`GET /orders/${id}/notes`]: [],
    [`GET /orders/${id}/disputes`]: [],
    [`GET /orders/${id}/refunds`]: [],
    [`GET /orders/${id}/claims`]: [],
    [`GET /payments/view/${id}`]: payment({ direction: view.order.direction ?? 'purchase' }),
    [`GET /orders/${id}/shipments`]: [],
    [`GET /orders/${id}/fulfillments`]: null,
    [`GET /orders/${id}/documents`]: [],
    'GET /addresses': [],
    'GET /payments/methods': [],
    'GET /payments/payouts/pay_to': [],
    'GET /account/session': session(fresh),
    'GET /employees': [],
    'GET /sms': [],
    [`GET /customers/${CUSTOMER_ID}/timeline`]: [],
    [`GET /lots/${scrapLot.lot_id}/images`]: [],
    [`GET /lots/${bullionLot.lot_id}/images`]: [],
    ...extra,
  })
}
