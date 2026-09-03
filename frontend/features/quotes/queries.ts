// The quote hooks: every number a customer sees comes from these, and from
// nowhere else (Jacob's no-previews ruling - the client computes nothing).
//
// Types come from the contracts' permanent quote shapes. Bodies carry items
// and choices only; the server prices from its own spots and refuses
// anything a body tries to ride along - the $26.81 pin in the API's
// replay tests holds it there.
//
// REFRESH CADENCE: quotes reprice on the same 10s rhythm the spot ticker
// already uses, and keepPreviousData stops the totals flickering to
// undefined between ticks. The query key is the serialized body, so a cart
// or choice change is a new quote, not a refetch of the old one.
//
// IDS AND QUANTITIES, NEVER PRICES (D214 item 11, ruling 43; streamline-a).
// Every body below used to carry a display name, a premium or a spot the
// server was asked to trust; every one of those is now a row this file
// resolves against a cached reference list - the same lists
// useCreateSalesOrder already resolves a checkout row's ids against, so a
// quote and the order it prices agree. `using_funds` is GONE from both quote
// bodies below: credit applies whenever the customer has a balance, which is
// what placement already does (a behaviour change, flagged in
// docs/waves/streamline-a-shape-changes.md §1/§2).
import { useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import { apiRequest } from '@/shared/queries/axios'
import { useSpotPrices } from '@/features/spots/queries'
import { usePaymentMethods } from '@/features/payments/queries'
import { useSaleShippingServices } from '@/features/shipping/queries'
import type { SellCartItem } from '@/features/cart/types'
import type { SpotPrice } from '@/features/spots/types'
import type {
  CatalogQuote,
  SalesOrderQuote,
  PurchaseOrderQuote,
  PurchaseQuoteItem,
  OrderQuote,
  ProfitBreakdown,
} from '@dorado/contracts'

export type CatalogQuoteItem = { id: string; quantity?: number }

export const useCatalogQuote = (items: CatalogQuoteItem[], side: 'ask' | 'bid') =>
  useApiQuery<CatalogQuote>({
    key: queryKeys.catalogQuote(items, side),
    requireUser: false,
    enabled: items.length > 0,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
    request: async () =>
      apiRequest<CatalogQuote>('POST', '/quotes/catalog', { items, side }),
  })

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

  const wireBody = {
    items: body.items,
    address_id: body.address_id ?? undefined,
    carrier_service_id,
    payment_method_id,
    user_id: body.user_id ?? undefined,
  }

  // A CHOSEN service/method waits for its reference list before firing - a
  // request that fired mid-load would price without the shipping charge or
  // surcharge for one tick, then reprice a moment later. No choice yet is a
  // real, immediate state (nothing to wait for); a choice whose list has not
  // arrived is not.
  const carrierPending = !!body.shipping_service && saleServices.length === 0
  const paymentPending = !!body.payment_method && saleMethods.length === 0

  return useApiQuery<SalesOrderQuote>({
    key: queryKeys.salesOrderQuote(wireBody),
    requireUser: true,
    enabled: enabled && body.items.length > 0 && !carrierPending && !paymentPending,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
    request: async () =>
      apiRequest<SalesOrderQuote>('POST', '/quotes/sales_order', wireBody),
  })
}

// Null rather than a partial batch: a dropped line shifts every later index,
// and quote lines pair back to the store array by index.
function toPurchaseQuoteItems(
  items: SellCartItem[],
  metals: Pick<SpotPrice, 'id' | 'name'>[]
): PurchaseQuoteItem[] | null {
  const out: PurchaseQuoteItem[] = []
  for (const item of items) {
    if (item.bullion_id !== null) {
      out.push({ type: 'product', bullion_id: item.bullion_id, quantity: item.quantity })
      continue
    }
    const metal_id = item.metal_id ?? metals.find((m) => m.name === item.metal)?.id
    if (!metal_id) return null
    out.push({
      type: 'scrap',
      metal_id,
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
// GOODS rather than a payout - the sell cart and the scrap review step want
// "what is this metal worth", not "what will land in your account".
export const usePurchaseOrderQuote = (
  items: SellCartItem[],
  deductions: { shipping_charge?: number; payout_method?: string } = {},
  enabled = true
) => {
  const { data: metals = [] } = useSpotPrices()
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')

  const quoteItems = toPurchaseQuoteItems(items, metals)
  const payout_method_id = deductions.payout_method
    ? payoutMethods.find((m) => m.type === deductions.payout_method)?.id
    : undefined
  // A CHOSEN payout method waits for its reference list too - see the same
  // note on useSalesOrderQuote.
  const payoutPending = !!deductions.payout_method && payoutMethods.length === 0

  return useApiQuery<PurchaseOrderQuote>({
    key: queryKeys.purchaseOrderQuote(quoteItems, {
      shipping_charge: deductions.shipping_charge,
      payout_method_id,
    }),
    // Public like the catalogue: the anonymous sell cart estimates what the
    // business would pay, exactly as the client math it replaced did.
    requireUser: false,
    enabled: enabled && !!quoteItems && quoteItems.length > 0 && !payoutPending,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
    request: async () =>
      apiRequest<PurchaseOrderQuote>('POST', '/quotes/purchase_order', {
        items: quoteItems ?? [],
        ...(deductions.shipping_charge != null && { shipping_charge: deductions.shipping_charge }),
        ...(payout_method_id != null && { payout_method_id }),
      }),
  })
}

// An EXISTING purchase order, priced by the server - the order drawers' line
// prices, subtotals and total. Guarded: the API's requireOwnOrder answers the
// owner and admins only, so requireUser is true unlike the goods quotes.
// Stored (accepted) prices come back flagged "stored"; everything else is an
// estimate at the order's locked spots when it has them, live spots when not.
export const useOrderQuote = (order_id: string, enabled = true) =>
  useApiQuery<OrderQuote>({
    key: queryKeys.orderQuote(order_id),
    requireUser: true,
    enabled: enabled && !!order_id,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
    request: async () => apiRequest<OrderQuote>('POST', '/quotes/order', { order_id }),
  })

// POST /quotes/profit_breakdown. The three-party profit view of a purchase
// order - the LAST client money math to die (computePurchaseOrderTotals,
// 2026-08-28): the server prices it from the order's own spots, refiner
// spots and rates. Admin-only, like the numbers it exposes.
export const useProfitBreakdown = (order_id: string, enabled = true) =>
  useApiQuery<ProfitBreakdown>({
    key: queryKeys.profitBreakdown(order_id),
    requireUser: true,
    requireAdmin: true,
    enabled: enabled && !!order_id,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
    request: async () =>
      apiRequest<ProfitBreakdown>('POST', '/quotes/profit_breakdown', { order_id }),
  })
