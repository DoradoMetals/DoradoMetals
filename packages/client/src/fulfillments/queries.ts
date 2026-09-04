"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CheckoutRate, Direction, FulfillmentCreateBody, FulfillmentDirectPatch,
  FulfillmentMethodPatch, FulfillmentMethodRead, FulfillmentPatchBody,
  FulfillmentPickupPatch, FulfillmentView,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

function absorb(client: QueryClient, view: FulfillmentView | null): FulfillmentView | null {
  const order_id = view?.fulfillment.order_id;
  if (order_id) client.setQueryData(keys.fulfillments.forOrder(order_id), view);
  client.invalidateQueries({ queryKey: keys.fulfillments.all(), refetchType: "active" });
  return view;
}

export function useOrderFulfillment(order_id: string | null | undefined, enabled = true) {
  return useQuery<FulfillmentView>({
    queryKey: keys.fulfillments.forOrder(order_id ?? ""),
    queryFn: () => apiRequest<FulfillmentView>("GET", `/orders/${order_id}/fulfillments`),
    enabled: enabled && !!order_id,
    retry: false,
  });
}

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

export function useCreateFulfillment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: FulfillmentCreateBody) =>
      await apiRequest<FulfillmentView>("POST", "/fulfillments", body),
    onSuccess: (view) => {
      client.setQueryData(keys.fulfillments.one(view.fulfillment.id), view);
      client.invalidateQueries({ queryKey: keys.checkout.all() });
      absorb(client, view);
    },
  });
}

export function usePatchFulfillment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (
      { fulfillment_id, ...body }: { fulfillment_id: string } & FulfillmentPatchBody
    ) =>
      await apiRequest<FulfillmentView>(
        "PATCH", `/fulfillments/${fulfillment_id}`, body as FulfillmentPatchBody
      ),
    onSuccess: (view) => {
      client.setQueryData(keys.fulfillments.one(view.fulfillment.id), view);
      client.invalidateQueries({ queryKey: keys.checkout.all() });
      absorb(client, view);
    },
  });
}

export function useFulfillment(fulfillment_id: string | null | undefined, enabled = true) {
  return useQuery<FulfillmentView>({
    queryKey: keys.fulfillments.one(fulfillment_id ?? ""),
    queryFn: () => apiRequest<FulfillmentView>("GET", `/fulfillments/${fulfillment_id}`),
    enabled: enabled && !!fulfillment_id,
    retry: false,
  });
}

export function useFulfillmentRates(view: FulfillmentView | undefined) {
  const parcel = view?.parcel ?? null;
  const missing = view?.missing ?? [];
  const ready =
    !!view
    && view.method.category === "SHIPMENT"
    && !missing.includes("package_id")
    && !missing.includes("shipper_address_id");
  return useQuery<CheckoutRate[]>({
    queryKey: keys.fulfillments.rates(
      view?.fulfillment.id ?? "", parcel?.shipper_address_id, parcel?.package_id
    ),
    enabled: ready,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () =>
      apiRequest<CheckoutRate[]>("GET", `/fulfillments/${view!.fulfillment.id}/rates`),
  });
}
