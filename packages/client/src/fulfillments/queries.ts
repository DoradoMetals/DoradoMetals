"use client";

// HOW AN ORDER IS HANDED OVER. One hook per endpoint, typed only from
// @dorado/contracts.
//
// `useOrderFulfillment` is the one that matters: GET /orders/:orderId/
// fulfillments answers the whole FulfillmentView - the row, its method, its
// booking (a pickup or a direct, whichever the method's category names), its
// parcels, whether it needs scheduling, whether it has been scheduled, when,
// and `actions`, which says what may be DONE to it.
//
// A screen used to read the bare row, look its method up in a cached list,
// branch on `category` to decide which child read to make, and then decide for
// itself whether a "Cancel booking" button was earned. It renders one object
// now.
//
// EVERY MUTATION ANSWERS THAT SAME VIEW, so the cache is written FROM THE
// RESPONSE rather than invalidated and re-fetched.
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  Direction, FulfillmentDirectPatch, FulfillmentMethodPatch, FulfillmentMethodRead,
  FulfillmentPickupPatch, FulfillmentView,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

// The view is authoritative for its order; the schedule carries the same rows
// and is re-read.
function absorb(client: QueryClient, view: FulfillmentView | null): FulfillmentView | null {
  const order_id = view?.fulfillment.order_id;
  if (order_id) client.setQueryData(keys.fulfillments.forOrder(order_id), view);
  client.invalidateQueries({ queryKey: keys.fulfillments.all(), refetchType: "active" });
  return view;
}

// GET /api/orders/:orderId/fulfillments - owner-or-admin. 404 when the order
// has no fulfillment, which is a real state, so this does not sit re-asking
// for a row that will not appear.
export function useOrderFulfillment(order_id: string | null | undefined, enabled = true) {
  return useQuery<FulfillmentView>({
    queryKey: keys.fulfillments.forOrder(order_id ?? ""),
    queryFn: () => apiRequest<FulfillmentView>("GET", `/orders/${order_id}/fulfillments`),
    enabled: enabled && !!order_id,
    retry: false,
  });
}

// GET /api/fulfillments/schedule - everyone an employee is expected to turn up
// for, soonest first. Admin. Shipments are absent by construction: nobody is
// due anywhere for a parcel.
export function useFulfillmentSchedule(
  window: { from?: string; to?: string; employee_id?: string } = {},
  enabled = true
) {
  return useQuery<FulfillmentView[]>({
    queryKey: keys.fulfillments.schedule(window),
    queryFn: () => apiRequest<FulfillmentView[]>("GET", "/fulfillments/schedule", undefined, window),
    enabled,
  });
}

// Reference data: the menu a customer is offered for a direction. Cached hard -
// eleven seeded rows, changing when the business changes how it takes metal in.
const REFERENCE_STALE_TIME = 60 * 60 * 1000;

export function useFulfillmentMethods(direction: Direction, enabled = true) {
  return useQuery<FulfillmentMethodRead[]>({
    queryKey: keys.fulfillments.methods(direction),
    queryFn: () =>
      apiRequest<FulfillmentMethodRead[]>("GET", "/fulfillments/methods", undefined, { direction }),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

// The admin list - every method, hidden and disabled ones included.
export function useAllFulfillmentMethods(enabled = true) {
  return useQuery<FulfillmentMethodRead[]>({
    queryKey: keys.fulfillments.allMethods(),
    queryFn: () => apiRequest<FulfillmentMethodRead[]>("GET", "/fulfillments/methods/all"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useUpdateFulfillmentMethod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, method }: { id: string; method: FulfillmentMethodPatch }) =>
      await apiRequest<FulfillmentMethodRead | null>(
        "POST", "/fulfillments/methods/update", { id, method }
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.fulfillments.all(), refetchType: "active" });
    },
  });
}

// ------------------------------------------------------------- the bookings

// US COLLECTING FROM THE CUSTOMER. The fulfillment is named once, at the top
// level; the booking's own columns ride beside it.
export function useSchedulePickup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (
      { fulfillment_id, pickup }: { fulfillment_id: string; pickup: FulfillmentPickupPatch }
    ) =>
      await apiRequest<FulfillmentView | null>(
        "POST", "/fulfillments/schedule_pickup", { fulfillment_id, pickup }
      ),
    onSuccess: (view) => absorb(client, view),
  });
}

// THE CUSTOMER COMING TO US - an appointment at one of our locations.
export function useScheduleDirect() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (
      { fulfillment_id, direct }: { fulfillment_id: string; direct: FulfillmentDirectPatch }
    ) =>
      await apiRequest<FulfillmentView | null>(
        "POST", "/fulfillments/schedule_direct", { fulfillment_id, direct }
      ),
    onSuccess: (view) => absorb(client, view),
  });
}

// Cancelling clears whichever booking existed - the caller does not say which
// kind, because the fulfillment holds at most one.
export function useCancelSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ fulfillment_id }: { fulfillment_id: string }) =>
      await apiRequest<FulfillmentView | null>(
        "POST", "/fulfillments/cancel_schedule", { fulfillment_id }
      ),
    onSuccess: (view) => absorb(client, view),
  });
}

// Moving an order onto a different method. Refused once a parcel is linked and
// the target is not a shipment - `actions.categories` is that same refusal,
// read ahead of the call, so a selector offers only what will be accepted.
export function useSetFulfillmentMethod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (
      { fulfillment_id, method_id }: { fulfillment_id: string; method_id: string }
    ) =>
      await apiRequest<FulfillmentView | null>(
        "POST", "/fulfillments/set_method", { fulfillment_id, method_id }
      ),
    onSuccess: (view) => absorb(client, view),
  });
}

export function useSetFulfillmentStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ fulfillment_id, status }: { fulfillment_id: string; status: string }) =>
      await apiRequest<FulfillmentView | null>(
        "POST", "/fulfillments/set_status", { fulfillment_id, status }
      ),
    onSuccess: (view) => absorb(client, view),
  });
}
