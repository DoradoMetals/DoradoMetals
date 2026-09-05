"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  CatalogQuote, Direction, OrderQuote, ProfitBreakdown, PurchaseOrderQuote, SalesOrderQuote,
} from "@dorado/contracts";
import { apiRequest } from "../fetch";
import { keys } from "../keys";

export type CatalogQuoteItem = { id: string; quantity?: number };

export function useCheckoutQuote(
  direction: Direction, options: { enabled?: boolean; user_id?: string } = {}
): UseQueryResult<PurchaseOrderQuote | SalesOrderQuote, Error> {
  return useQuery({
    queryKey: keys.quotes.checkout(direction, options.user_id),
    enabled: options.enabled ?? true,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () =>
      apiRequest<PurchaseOrderQuote | SalesOrderQuote>(
        "GET", "/quotes/checkout", undefined,
        { direction, user_id: options.user_id }
      ),
  });
}

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
