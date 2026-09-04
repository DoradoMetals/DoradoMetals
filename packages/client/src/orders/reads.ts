"use client";

// THE ORDER READS. One hook per endpoint, typed only from @dorado/contracts.
//
// `useOrder` is the one that matters: GET /orders/:id answers the whole
// OrderView - the row, its totals, its lines with their catalogue products
// and their arithmetic, the address snapshot, the parcels, the pickup, the
// payout, the customer, and `actions`, which says what may be DONE to it. A
// drawer used to assemble that out of six order-scoped reads and then decide
// for itself which buttons it earned; it renders one object now.
//
// The narrower reads stay for the screens that genuinely want one table: the
// spots editor (spots are not part of the view), and the lists.
import { useQuery } from "@tanstack/react-query";
import type {
  Address, OrderItem, OrderRead, OrderSpot, OrderView, Payout,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

// GET /api/orders - the SLIM list: the row plus `totals`. `direction` narrows
// it either way; `user_id` is how an admin asks for one customer's, and how
// any caller pins the list to themselves.
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

// GET /api/orders/:id - ONE ORDER, WHOLE.
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

// The order's frozen quotes, one row per metal. Polled: an unlocked order
// shows today's feed, which moves.
export function useOrderSpots(order_id: string | null | undefined, enabled = true) {
  return useQuery<OrderSpot[]>({
    queryKey: keys.orders.spots(order_id ?? ""),
    queryFn: () => apiRequest<OrderSpot[]>("GET", `/orders/${order_id}/spots`),
    enabled: enabled && !!order_id,
    refetchInterval: 60_000,
  });
}

// 404 when the order has no address link, which is a real state - so this
// does not sit re-asking for a row that will not appear.
export function useOrderAddress(order_id: string | null | undefined, enabled = true) {
  return useQuery<Address>({
    queryKey: keys.orders.address(order_id ?? ""),
    queryFn: () => apiRequest<Address>("GET", `/orders/${order_id}/address`),
    enabled: enabled && !!order_id,
    retry: false,
  });
}

// The order's parcels live in ../shipping now: GET /orders/:orderId/shipments
// answers the composed ShipmentView (the row plus its service, box, booking,
// progress and actions), and a second hook returning the bare rows from the
// same URL would be two answers to one question.

// LAST FOUR ONLY - the full bank numbers have their own admin-only endpoint.
export function useOrderPayouts(order_id: string | null | undefined, enabled = true) {
  return useQuery<Payout[]>({
    queryKey: keys.orders.payouts(order_id ?? ""),
    queryFn: () => apiRequest<Payout[]>("GET", `/orders/${order_id}/payouts`),
    enabled: enabled && !!order_id,
  });
}
