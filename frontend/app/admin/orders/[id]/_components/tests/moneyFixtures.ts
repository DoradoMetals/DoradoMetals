import type { NoteView, OrderPaymentFacts, RefundView } from '@dorado/contracts'

import { ADMIN_ID, CUSTOMER_ID, ORDER_ID } from './detailFixtures'

const RID = '00000000-0000-4000-8000-0000000000f'

export const refund = (over: Partial<RefundView> = {}): RefundView => ({
  id: `${RID}1`,
  order_id: ORDER_ID,
  rail: 'CARD',
  provider: 'stripe',
  payment_ref: null,
  details_id: null,
  amount: 1105.2,
  reason: 'Customer returned two coins',
  state: 'Succeeded',
  provider_ref: null,
  failure_reason: null,
  refunded_at: '2026-10-02T20:10:00Z',
  created_at: '2026-10-02T20:10:00Z',
  updated_at: '2026-10-02T20:10:00Z',
  created_by_id: ADMIN_ID,
  updated_by_id: null,
  card_brand: 'Visa',
  card_last4: '4242',
  ...over,
})

export const refunds: RefundView[] = [
  refund(),
  refund({
    id: `${RID}2`,
    amount: 250,
    rail: 'ACH',
    card_brand: null,
    card_last4: null,
    created_at: '2026-09-30T15:02:00Z',
    created_by_id: CUSTOMER_ID,
  }),
]

export const note = (over: Partial<NoteView> = {}): NoteView => ({
  id: `${RID}3`,
  user_id: null,
  lead_id: null,
  order_id: ORDER_ID,
  body: 'Customer asked for the payout before Friday. eCheck is fine.',
  created_at: '2026-10-02T19:14:00Z',
  updated_at: '2026-10-02T19:14:00Z',
  created_by_id: ADMIN_ID,
  updated_by_id: null,
  author_id: ADMIN_ID,
  ...over,
})

export const paymentFacts = (over: Partial<OrderPaymentFacts> = {}): OrderPaymentFacts => ({
  received: 14120,
  refunded: 0,
  refundable: 14120,
  charge_received: true,
  ...over,
})
