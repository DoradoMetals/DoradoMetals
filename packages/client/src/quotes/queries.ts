'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type {
  CheckoutQuote,
  Direction,
  OrderPricing,
  PriceSide,
  ProductQuote,
  ProfitBreakdown,
} from '@dorado/contracts'
import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useCheckoutQuote(
  direction: Direction,
  options: { enabled?: boolean; user_id?: string } = {}
): UseQueryResult<CheckoutQuote, Error> {
  return useQuery({
    queryKey: keys.quotes.checkout(direction, options.user_id),
    enabled: options.enabled ?? true,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () =>
      apiRequest<CheckoutQuote>('GET', '/quotes/checkout', undefined, {
        direction,
        user_id: options.user_id,
      }),
  })
}

export function useProductQuote(
  bullion_id: string | null | undefined,
  side: PriceSide,
  quantity = 1
): UseQueryResult<ProductQuote, Error> {
  return useQuery({
    queryKey: keys.quotes.catalog(bullion_id ?? '', side, quantity),
    enabled: !!bullion_id,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () =>
      apiRequest<ProductQuote>('POST', '/quotes/catalog', { bullion_id, side, quantity }),
  })
}

export function useOrderPricing(
  order_id: string | null | undefined,
  enabled = true
): UseQueryResult<OrderPricing, Error> {
  return useQuery({
    queryKey: keys.quotes.order(order_id ?? ''),
    enabled: enabled && !!order_id,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () => apiRequest<OrderPricing>('POST', '/quotes/order', { order_id }),
  })
}

export function useProfitBreakdown(
  order_id: string | null | undefined,
  enabled = true
): UseQueryResult<ProfitBreakdown, Error> {
  return useQuery({
    queryKey: keys.quotes.profit(order_id ?? ''),
    enabled: enabled && !!order_id,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () => apiRequest<ProfitBreakdown>('POST', '/quotes/profit_breakdown', { order_id }),
  })
}
