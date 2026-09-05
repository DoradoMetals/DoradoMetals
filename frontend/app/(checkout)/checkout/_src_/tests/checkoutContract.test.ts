// WHAT THE CHECKOUT SURFACE READS OFF THE SERVER.
//
// This file used to pin `data?.address?.id` - the one field both checkout
// screens dug out of an order response and posted back as `address_id`, and
// the tightest coupling between the two halves of the codebase. That coupling
// is gone: the surface reads `recipient_address_id` off the checkout row, and
// the parcel's own origin off the draft fulfillment, and PATCHes an id into
// whichever owns it.
//
// THE ROW SHRANK AGAIN (rulings 69/70, migration 128): nine handover columns
// left `checkout.checkouts` for the draft fulfillment's own detail row, so what
// crosses the wire is four pointers, a direction and ONE list. That list is
// COMPOSED - checkout's own four steps plus whatever the fulfillment says its
// handover still owes - and both halves are closed enums, which is what this
// file pins.
import { describe, expect, test } from 'vitest'
import { CheckoutMissing, CheckoutView } from '@dorado/contracts'
import { isPayoutComplete, toPayoutForm } from '../payoutStep/payoutDraft'

const serverRow = (over: Record<string, unknown> = {}) => ({
  id: '3f1a6d0e-5c33-4f8e-9a1a-2b3c4d5e6f70',
  user_id: '9a1a2b3c-4d5e-4f70-8a1a-2b3c4d5e6f71',
  direction: 'purchase',
  payment_method_id: null,
  payment_details_id: null,
  recipient_address_id: null,
  fulfillment_id: null,
  // The view carries the basket now, not just the pointers.
  items: [],
  missing: [
    'items',
    'shipper_address_id',
    'package_id',
    'carrier_service_id',
    'payment_details_id',
  ],
  ...over,
})

describe('the composed checkout row', () => {
  test('parses as CheckoutView, missing included', () => {
    const parsed = CheckoutView.safeParse(serverRow())
    expect(parsed.success).toBe(true)
  })

  // `missing` is the union of two closed enums - the checkout's own steps and
  // the fulfillment's - so a step the server invents cannot arrive as an
  // unrendered string, and the composition is what makes both halves legal in
  // one list.
  test('missing is a list of known steps, in the order the stepper walks', () => {
    const row = CheckoutView.parse(serverRow())
    for (const step of row.missing) {
      expect(CheckoutMissing.safeParse(step).success).toBe(true)
    }
    expect(row.missing[0]).toBe('items')
    expect(row.missing).toContain('package_id')
  })

  test('a step the server does not know about is refused, not rendered', () => {
    expect(CheckoutView.safeParse(serverRow({ missing: ['insurance'] })).success).toBe(false)
  })
})

describe('the payout draft, which is the one thing the row cannot hold', () => {
  const ach = {
    method: 'ACH' as const,
    account_holder_name: 'A Customer',
    bank_name: 'Test Bank',
    account_type: 'Checking' as const,
    routing_number: '021000021',
    account_number: '000123456789',
    confirmation: true,
    cost: 0,
  }

  test('an incomplete form is not complete', () => {
    expect(isPayoutComplete(null)).toBe(false)
    expect(isPayoutComplete({ method: 'ACH' })).toBe(false)
    expect(isPayoutComplete({ ...ach, routing_number: '123' })).toBe(false)
    // The confirmation checkbox is part of the rule, and it is client-only.
    expect(isPayoutComplete({ ...ach, confirmation: false })).toBe(false)
  })

  test('a complete form is complete', () => {
    expect(isPayoutComplete(ach)).toBe(true)
  })

  // POST /checkout/payout is strict: a confirmation checkbox or a displayed
  // fee would be refused as an unknown key, and a 422 at the last step of the
  // sell flow is the whole checkout.
  test('only the seven wire columns are sent', () => {
    expect(Object.keys(toPayoutForm(ach)).sort()).toEqual([
      'account_holder_name',
      'account_number',
      'account_type',
      'bank_name',
      'method',
      'payout_email',
      'routing_number',
    ])
  })
})
