"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  Address, OrderItem, OrderRead, OrderSpot, OrderView, Payout,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

export function useOrders(
  narrowing: { direction?: "purchase" | "sale"; user_id?: string } = {},
  options: { enabled?: boolean; refetchInterval?: number } = {}
) {
  return useQuery<OrderRead[]>({
    queryKey: keys.orders.list(narrowing),
    queryFn: () => apiRequest<OrderRead[]>("GET", "/orders", undefined, narrowing),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
  });
}

export function useOrder(order_id: string | null | undefined, enabled = true) {
  return useQuery<OrderView>({
    queryKey: keys.orders.view(order_id ?? ""),
    queryFn: () => apiRequest<OrderView>("GET", `/orders/${order_id}`),
    enabled: enabled && !!order_id,
  });
}

export function useOrderItems(order_id: string | null | undefined, enabled = true) {
  return useQuery<OrderItem[]>({
    queryKey: keys.orders.items(order_id ?? ""),
    queryFn: () => apiRequest<OrderItem[]>("GET", `/orders/${order_id}/items`),
    enabled: enabled && !!order_id,
  });
}

export function useOrderSpots(order_id: string | null | undefined, enabled = true) {
  return useQuery<OrderSpot[]>({
    queryKey: keys.orders.spots(order_id ?? ""),
    queryFn: () => apiRequest<OrderSpot[]>("GET", `/orders/${order_id}/spots`),
    enabled: enabled && !!order_id,
    refetchInterval: 60_000,
  });
}

export function useOrderAddress(order_id: string | null | undefined, enabled = true) {
  return useQuery<Address>({
    queryKey: keys.orders.address(order_id ?? ""),
    queryFn: () => apiRequest<Address>("GET", `/orders/${order_id}/address`),
    enabled: enabled && !!order_id,
    retry: false,
  });
}

export function useOrderPayouts(order_id: string | null | undefined, enabled = true) {
  return useQuery<Payout[]>({
    queryKey: keys.orders.payouts(order_id ?? ""),
    queryFn: () => apiRequest<Payout[]>("GET", `/orders/${order_id}/payouts`),
    enabled: enabled && !!order_id,
  });
}
