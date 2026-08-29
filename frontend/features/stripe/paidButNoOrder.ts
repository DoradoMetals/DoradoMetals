// What to tell someone whose card was charged and whose order was not recorded.
//
// THIS IS THE WORST STATE THE APPLICATION CAN REACH, and until D179 it was also
// the quietest: `stripe.confirmPayment` succeeds, then either the payload parse
// throws or `POST /sales_orders/create_sales_order` fails, and nothing was
// surfaced at all - no message, no redirect, no retry, no record. The customer
// sat on the checkout page having paid.
//
// The message therefore has one job beyond apologising: PUT THE PAYMENT INTENT
// ID IN FRONT OF THE CUSTOMER. It is the only identifier that exists at this
// point - there is no order number, because there is no order - and it is what
// lets support find the charge in Stripe and reconcile by hand. A generic
// "something went wrong" here loses the money's only handle.
//
// Deliberately NOT a retry button. Re-submitting the form calls confirmPayment
// again on an intent that already succeeded; the safe recovery is a human
// looking at the intent, not the browser guessing.
export function paidButNoOrder(paymentIntentId: string): string {
  return (
    `Your payment went through, but we could not finish creating your order. ` +
    `Your cart has been kept. Please contact support and quote payment reference ` +
    `${paymentIntentId} — do not submit the payment again.`
  )
}
