"use client";

// THE ORDER MUTATIONS. Every one of them sends IDS PLUS GENUINELY NEW DATA
// (ruling 43) and answers the whole OrderView, so the cache is written FROM
// THE RESPONSE rather than guessed at optimistically and then re-fetched.
//
// That is the change this file exists for. The old hooks flipped a status in
// two list caches, rolled back on error, and invalidated eleven query keys on
// settle - a policy that had to be kept in step with what each endpoint
// touched. An action returns the order it just changed; writing that in is
// exact, and the lists refresh behind it.
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  Direction, OrderCancelBody, OrderItem, OrderItemPatch, OrderPatch,
  OrderSpotsPutBody, OrderView,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

// The view is authoritative; the lists carry the same row and are re-read.
function absorb(client: QueryClient, view: OrderView): OrderView {
  client.setQueryData(keys.orders.view(view.order.id), view);
  client.invalidateQueries({ queryKey: keys.orders.all(), refetchType: "active" });
  return view;
}

// A write against one of the order's TABLES - a line, a spot, a parcel, a
// payout, a refiner value - does not answer a view, so the order's own reads
// are re-asked for. EXPORTED, because the features that own those tables
// settle through it: it is the one cache policy for anything order-shaped.
export function invalidateOrder(client: QueryClient, order_id: string): void {
  client.invalidateQueries({ queryKey: keys.orders.scoped(order_id), refetchType: "active" });
  client.invalidateQueries({ queryKey: keys.orders.all(), refetchType: "active" });
}

// ---------------------------------------------------------------- the order

// PLACING ONE. The whole body is the CHECKOUT'S ID: the address, the lines,
// the service and the payment method are all columns of a row the server
// already holds, and the customer is that row's own user_id.
export function usePlaceOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ checkout_id, direction }: { checkout_id: string; direction: Direction }) =>
      await apiRequest<OrderView>(
        "POST",
        direction === "sale"
          ? "/sales_orders/create_sales_order"
          : "/purchase_orders/create_from_checkout",
        { checkout_id }
      ),
    onSuccess: (view) => absorb(client, view),
  });
}

// An admin places a customer's order by naming that CUSTOMER'S checkout.
export function useAdminPlaceSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ checkout_id }: { checkout_id: string }) =>
      await apiRequest<OrderView>("POST", "/sales_orders/admin_create_sales_order", {
        checkout_id,
      }),
    onSuccess: (view) => absorb(client, view),
  });
}

// PATCH /orders/:id - the row's own writable columns, `status` and `notes`.
// A status is a pure label (ruling 2): this writes it and does nothing else.
export function usePatchOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: OrderPatch }) =>
      await apiRequest<OrderView>("PATCH", `/orders/${id}`, patch),
    onSuccess: (view) => absorb(client, view),
  });
}

export function useCreateOrderReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: Direction }) =>
      await apiRequest<{ success: true }>(
        "POST",
        direction === "sale" ? "/sales_orders/create_review" : "/purchase_orders/create_review",
        { order: { id } }
      ),
    onSuccess: (_answer, { id }) => invalidateOrder(client, id),
  });
}

// -------------------------------------------------------------- the actions
//
// Each was a flag in the PATCH body until the API separated them. Each is a
// real operation - two move money, two call a carrier, one sends a refiner
// their copy - and `OrderView.actions` says which of them this order can take,
// so a screen never decides for itself.

export function useFinalizePricing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      await apiRequest<OrderView>("POST", `/orders/${id}/finalize_pricing`),
    onSuccess: (view) => absorb(client, view),
  });
}

export function useAddFunds() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      await apiRequest<OrderView>("POST", `/orders/${id}/add_funds`),
    onSuccess: (view) => absorb(client, view),
  });
}

// The return leg. Where it goes and what it is worth are the ORDER'S own -
// the box and the service are the two genuinely new choices.
export function useCancelOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & OrderCancelBody) =>
      await apiRequest<OrderView>("POST", `/orders/${id}/cancel`, body),
    onSuccess: (view) => absorb(client, view),
  });
}

// The retry surface for a purchase whose own label purchase failed after the
// order committed. NO BODY: the server computes the parcel from the order.
export function useBuyLabel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      await apiRequest<OrderView>("POST", `/orders/${id}/label`),
    onSuccess: (view) => absorb(client, view),
  });
}

export function useSendToRefiner() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, refiner_id }: { id: string; refiner_id: string }) =>
      await apiRequest<OrderView>("POST", `/orders/${id}/send_to_refiner`, { refiner_id }),
    onSuccess: (view) => absorb(client, view),
  });
}

// ---------------------------------------------------------------- the lines
//
// ONE FLAT PATCH of the row's own columns: a key present is written, an
// explicit null clears, an absent key is left alone. A new line is the same
// patch - a bullion_id, or a metal_id with its weights.

export function useCreateOrderItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ order_id, patch }: { order_id: string; patch: OrderItemPatch }) =>
      await apiRequest<OrderItem>("POST", `/orders/${order_id}/items`, patch),
    onSuccess: (_line, { order_id }) => invalidateOrder(client, order_id),
  });
}

export function usePatchOrderItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (
      { item_id, patch }: { item_id: string; order_id: string; patch: OrderItemPatch }
    ) => await apiRequest<OrderItem>("PATCH", `/orders/items/${item_id}`, patch),
    onSuccess: (_line, { order_id }) => invalidateOrder(client, order_id),
  });
}

export function useDeleteOrderItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ item_id }: { item_id: string; order_id: string }) =>
      await apiRequest<{ success: true }>("DELETE", `/orders/items/${item_id}`),
    onSuccess: (_answer, { order_id }) => invalidateOrder(client, order_id),
  });
}

// ---------------------------------------------------------------- the spots
//
// `lock: true` pins every metal at the prices the SERVER resolves - the
// browser's copy of the feed never crosses the wire. `set` names a metal by
// ID, because a display name was a lookup the server had to undo.
export function useSetOrderSpots() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ order_id, ...body }: { order_id: string } & OrderSpotsPutBody) =>
      await apiRequest<unknown>("PUT", `/orders/${order_id}/spots`, body),
    onSuccess: (_answer, { order_id }) => invalidateOrder(client, order_id),
  });
}
