"use client";

// THE THREE QUOTE READS THAT TAKE NO CODE-TO-ID RESOLUTION - the catalogue
// asks by product id, and an existing order is entirely the server's.
// useSalesQuote/usePurchaseQuote (../checkout/queries.ts) are the other two;
// they already take the full contract body.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { CatalogQuote, OrderQuote, ProfitBreakdown } from "@dorado/contracts";
import { apiRequest } from "../fetch";
import { keys } from "../keys";

export type CatalogQuoteItem = { id: string; quantity?: number };

// POST /quotes/catalog - public, like GET /spots.
export function useCatalogQuote(
  items: CatalogQuoteItem[], side: "ask" | "bid"
): UseQueryResult<CatalogQuote, Error> {
  return useQuery({
    queryKey: keys.quotes.catalog(items, side),
    enabled: items.length > 0,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () => apiRequest<CatalogQuote>("POST", "/quotes/catalog", { items, side }),
  });
}

// POST /quotes/order - an EXISTING purchase order, priced right now (or its
// stored prices). Guarded server-side: the caller may only quote their own.
export function useOrderQuote(
  order_id: string | null | undefined, enabled = true
): UseQueryResult<OrderQuote, Error> {
  return useQuery({
    queryKey: keys.quotes.order(order_id ?? ""),
    enabled: enabled && !!order_id,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () => apiRequest<OrderQuote>("POST", "/quotes/order", { order_id }),
  });
}

// POST /quotes/profit_breakdown - admin only, like the numbers it exposes.
export function useProfitBreakdown(
  order_id: string | null | undefined, enabled = true
): UseQueryResult<ProfitBreakdown, Error> {
  return useQuery({
    queryKey: keys.quotes.profit(order_id ?? ""),
    enabled: enabled && !!order_id,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () => apiRequest<ProfitBreakdown>("POST", "/quotes/profit_breakdown", { order_id }),
  });
}
