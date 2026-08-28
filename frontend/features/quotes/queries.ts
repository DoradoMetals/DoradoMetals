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
import { useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import { apiRequest } from '@/shared/queries/axios'
import type {
  CatalogQuote,
  SalesOrderQuote,
  PurchaseOrderQuote,
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

export type SalesOrderQuoteBody = {
  items: { id: string; quantity: number }[]
  using_funds: boolean
  shipping_service?: string | null
  payment_method?: string | null
  address_id?: string | null
  // Honored for ADMINS only (the server's subjectOf, same rule as the address
  // book): the quote prices the named customer's funds row instead of the
  // caller's. Anyone else naming someone gets their own quote back.
  user_id?: string | null
}

export const useSalesOrderQuote = (body: SalesOrderQuoteBody, enabled = true) =>
  useApiQuery<SalesOrderQuote>({
    key: queryKeys.salesOrderQuote(body),
    requireUser: true,
    enabled: enabled && body.items.length > 0,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
    request: async () =>
      apiRequest<SalesOrderQuote>('POST', '/quotes/sales_order', body),
  })

// The sell-cart lines, exactly as the store holds them - the server resolves
// products by id or name (both spellings) and derives scrap content.
export type PurchaseOrderQuoteLine =
  | { type: 'product'; data: { id?: string; name?: string; quantity?: number } }
  | {
      type: 'scrap'
      data: {
        metal?: string
        pre_melt?: number | null
        purity?: number | null
        content?: number | null
        gross_unit?: string | null
      }
    }

export const usePurchaseOrderQuote = (items: PurchaseOrderQuoteLine[], enabled = true) =>
  useApiQuery<PurchaseOrderQuote>({
    key: queryKeys.purchaseOrderQuote(items),
    // Public like the catalogue: the anonymous sell cart estimates what the
    // business would pay, exactly as the client math it replaced did.
    requireUser: false,
    enabled: enabled && items.length > 0,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
    request: async () =>
      apiRequest<PurchaseOrderQuote>('POST', '/quotes/purchase_order', items ? { items } : { items: [] }),
  })

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
