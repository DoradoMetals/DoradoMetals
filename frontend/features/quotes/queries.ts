// THE QUOTE HOOKS: every number a customer sees comes from these, and from
// nowhere else (Jacob's no-previews ruling - the client computes nothing).
//
// `useCatalogQuote`, `useOrderQuote` and `useProfitBreakdown` take pure ids
// and moved to @dorado/client whole. `useSalesOrderQuote` and
// `usePurchaseOrderQuote` still live here: both resolve a CODE this UI state
// carries (a shipping service, a payment/payout method) against the reference
// lists @dorado/client's own hooks answer, then hand the resolved ids to
// `useSalesQuote`/`usePurchaseQuote` (../checkout/queries.ts, which already
// take the wire's own SalesOrderQuoteBody/PurchaseOrderQuoteBody).
import {
  usePaymentMethods,
  usePurchaseQuote,
  useSalesQuote,
  useSaleShippingServices,
} from '@dorado/client'
import type { CheckoutLine } from '@/features/checkout/items/types'
import type { PurchaseQuoteItem } from '@dorado/contracts'

export { useCatalogQuote, useOrderQuote, useProfitBreakdown } from '@dorado/client'
export type { CatalogQuoteItem } from '@dorado/client'

// `shipping_service` is the shipping.services row's CODE and `payment_method`
// the payments.methods row's TYPE - the same two vocabularies
// useCreateSalesOrder's checkout PATCH resolves - not the ids the wire wants
// now; this hook resolves both against the same cached reference lists so a
// caller keeps naming its choice the way the checkout store already does.
export type SalesOrderQuoteBody = {
  items: { id: string; quantity: number }[]
  shipping_service?: string | null
  payment_method?: string | null
  address_id?: string | null
  // Honored for ADMINS only (the server's subjectOf, same rule as the address
  // book): the quote prices the named customer's funds row instead of the
  // caller's. Anyone else naming someone gets their own quote back.
  user_id?: string | null
}

export const useSalesOrderQuote = (body: SalesOrderQuoteBody, enabled = true) => {
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const { data: saleServices = [] } = useSaleShippingServices()

  const carrier_service_id = body.shipping_service
    ? saleServices.find((s) => s.code === body.shipping_service)?.id
    : undefined
  const payment_method_id = body.payment_method
    ? saleMethods.find((m) => m.type === body.payment_method)?.id
    : undefined

  // A CHOSEN service/method waits for its reference list before firing - a
  // request that fired mid-load would price without the shipping charge or
  // surcharge for one tick, then reprice a moment later. No choice yet is a
  // real, immediate state (nothing to wait for); a choice whose list has not
  // arrived is not.
  const carrierPending = !!body.shipping_service && saleServices.length === 0
  const paymentPending = !!body.payment_method && saleMethods.length === 0

  return useSalesQuote(
    {
      items: body.items,
      address_id: body.address_id ?? undefined,
      carrier_service_id,
      payment_method_id,
      user_id: body.user_id ?? undefined,
    },
    { enabled: enabled && body.items.length > 0 && !carrierPending && !paymentPending }
  )
}

// Null rather than a partial batch: a dropped line shifts every later index,
// and quote lines pair back to the store array by index.
function toPurchaseQuoteItems(items: CheckoutLine[]): PurchaseQuoteItem[] | null {
  const out: PurchaseQuoteItem[] = []
  for (const item of items) {
    if (item.bullion_id) {
      out.push({ type: 'product', bullion_id: item.bullion_id, quantity: item.quantity ?? undefined })
      continue
    }
    if (!item.metal_id) return null
    out.push({
      type: 'scrap',
      metal_id: item.metal_id,
      pre_melt: item.pre_melt ?? 0,
      purity: item.purity ?? 0,
      unit: item.unit ?? undefined,
    })
  }
  return out
}

// `deductions.payout_method` is a payments.methods row's TYPE ('ACH', not its
// id) - resolved here the same way the sales quote resolves its own two
// choices. They are optional because three of the four call sites quote
// GOODS rather than a payout - the sell basket and the scrap review step want
// "what is this metal worth", not "what will land in your account".
export const usePurchaseOrderQuote = (
  items: CheckoutLine[],
  deductions: { shipping_charge?: number; payout_method?: string } = {},
  enabled = true
) => {
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')

  const quoteItems = toPurchaseQuoteItems(items)
  const payout_method_id = deductions.payout_method
    ? payoutMethods.find((m) => m.type === deductions.payout_method)?.id
    : undefined
  // A CHOSEN payout method waits for its reference list too - see the same
  // note on useSalesOrderQuote.
  const payoutPending = !!deductions.payout_method && payoutMethods.length === 0

  return usePurchaseQuote(
    {
      items: quoteItems ?? [],
      shipping_charge: deductions.shipping_charge ?? undefined,
      payout_method_id,
    },
    { enabled: enabled && !!quoteItems && quoteItems.length > 0 && !payoutPending }
  )
}
