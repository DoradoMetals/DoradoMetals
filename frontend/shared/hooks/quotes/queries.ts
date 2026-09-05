// THE QUOTE HOOKS: every number a customer sees comes from these, and from
// nowhere else (Jacob's no-previews ruling - the client computes nothing).
//
// NOTHING IS ASSEMBLED HERE ANY MORE. `useSalesOrderQuote` and
// `usePurchaseOrderQuote` used to resolve a shipping-service CODE and a
// payment/payout-method TYPE against two cached reference lists, then hand a
// basket the browser was holding to a body-shaped quote endpoint. The quote
// reads the CHECKOUT ROW now - `GET /quotes/checkout` - and that row already
// holds both ids and owns the items, so there is nothing left to resolve, to
// pair by index, or to wait on a reference list for.
export { useCheckoutQuote, useProductQuote, useOrderPricing, useProfitBreakdown } from '@dorado/client'
