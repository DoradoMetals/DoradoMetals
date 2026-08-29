import { describe, it, expect } from 'vitest'

import { paidButNoOrder } from './paidButNoOrder'

// D179. The customer has been charged and no order exists. The ONE property
// worth pinning is that the payment intent id survives into the message: it is
// the only identifier that exists in this state - there is no order number,
// because there is no order - and it is what lets support find the charge.
// A future edit that makes this message friendlier and drops the reference
// would leave the money with no handle, and would look like an improvement.
describe('paidButNoOrder', () => {
  it('puts the payment reference in front of the customer', () => {
    const msg = paidButNoOrder('pi_3QabcDEFghiJKlmn0op')
    expect(msg).toContain('pi_3QabcDEFghiJKlmn0op')
  })

  it('says the payment succeeded, so nobody reads it as a failed charge', () => {
    // The dangerous misreading is "payment failed, try again" - which is how a
    // customer double-charges themselves. confirmPayment already succeeded.
    const msg = paidButNoOrder('pi_x').toLowerCase()
    expect(msg).toContain('payment went through')
    expect(msg).toContain('do not submit the payment again')
  })

  it('tells them the cart was kept, because onSuccess is what clears it', () => {
    // clearCart() lives in the mutation's onSuccess and must stay there; if it
    // ever moves to the outer path this promise becomes a lie.
    expect(paidButNoOrder('pi_x')).toContain('cart has been kept')
  })
})
