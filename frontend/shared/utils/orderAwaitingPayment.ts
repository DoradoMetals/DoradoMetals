// What to tell someone whose ORDER exists and whose payment did not go through.
//
// Under create-then-charge this replaced paidButNoOrder as the checkout's
// failure state, and it is a much better one to be in: nothing has been
// charged, the order is saved awaiting payment, and submitting again only
// retries the payment - the form remembers the order it created and will not
// create a second one. If the customer walks away instead, the abandonment
// sweep cancels the order and returns any reserved credit.
export function orderAwaitingPayment(detail?: string | null): string {
  return (
    `Your order is saved, but the payment did not go through` +
    (detail ? ` — ${detail}` : `.`) +
    ` You have not been charged. You can try again, or use a different payment method.`
  );
}
