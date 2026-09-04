"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  Carrier, CarrierHandoff, CarrierLocations, CarrierPatch, CarrierPickupWindow, CarrierRead,
  CarrierServiceOption,
  CarrierServicePatch, CarrierServiceRead, SaleShippingService, ShipmentPatch, ShipmentView,
  ShippingCancelLabelBody, ShippingCancelPickupBody, ShippingCheckPickupBody,
  ShippingGetLocationsBody, ShippingValidateAddressBody,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

const REFERENCE_STALE_TIME = 60 * 60 * 1000;

const CARRIER_ANSWER_STALE_TIME = 5 * 60 * 1000;

function absorb(client: QueryClient, view: ShipmentView | null): ShipmentView | null {
  if (view) client.setQueryData(keys.shipping.shipment(view.shipment.id), view);
  client.invalidateQueries({ queryKey: keys.shipping.all(), refetchType: "active" });
  return view;
}

export function useShipment(shipment_id: string | null | undefined, enabled = true) {
  return useQuery<ShipmentView>({
    queryKey: keys.shipping.shipment(shipment_id ?? ""),
    queryFn: () => apiRequest<ShipmentView>("GET", `/shipments/${shipment_id}`),
    enabled: enabled && !!shipment_id,
  });
}

export function useOrderShipments(order_id: string | null | undefined, enabled = true) {
  return useQuery<ShipmentView[]>({
    queryKey: keys.shipping.forOrder(order_id ?? ""),
    queryFn: () => apiRequest<ShipmentView[]>("GET", `/orders/${order_id}/shipments`),
    enabled: enabled && !!order_id,
  });
}

export const outboundOf = (views: ShipmentView[] = []): ShipmentView | undefined =>
  views.find((v) => v.shipment.direction !== "Return");
export const returnOf = (views: ShipmentView[] = []): ShipmentView | undefined =>
  views.find((v) => v.shipment.direction === "Return");

export function useRefreshTracking() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ shipment_id }: { shipment_id: string }) =>
      await apiRequest<ShipmentView | null>("POST", "/shipping/get_tracking", { shipment_id }),
    onSuccess: (view) => absorb(client, view),
  });
}

export function usePatchShipment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ shipment_id, patch }: { shipment_id: string; patch: ShipmentPatch }) =>
      await apiRequest<ShipmentView | null>("PATCH", `/shipments/${shipment_id}`, patch),
    onSuccess: (view) => absorb(client, view),
  });
}

export function useCancelLabel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: ShippingCancelLabelBody) =>
      await apiRequest<ShipmentView | null>("POST", "/shipping/cancel_label", body),
    onSuccess: (view) => absorb(client, view),
  });
}

export function useCancelCarrierPickup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: ShippingCancelPickupBody) =>
      await apiRequest<unknown>("POST", "/shipping/cancel_pickup", body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.shipping.all(), refetchType: "active" });
    },
  });
}

export function useCarrierHandoffs(enabled = true) {
  return useQuery<CarrierHandoff[]>({
    queryKey: keys.shipping.handoffs(),
    queryFn: () => apiRequest<CarrierHandoff[]>("GET", "/shipping/handoffs"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useOfferedServices(carrier_id?: string | null, enabled = true) {
  return useQuery<CarrierServiceOption[]>({
    queryKey: keys.shipping.offeredServices(carrier_id),
    queryFn: () =>
      apiRequest<CarrierServiceOption[]>(
        "GET", "/carrier_services/offered", undefined, { carrier_id }
      ),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useSaleShippingServices(enabled = true) {
  return useQuery<SaleShippingService[]>({
    queryKey: keys.shipping.saleOptions(),
    queryFn: () => apiRequest<SaleShippingService[]>("GET", "/carrier_services/sale_options"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useCarrierLocations(body: ShippingGetLocationsBody | null, enabled = true) {
  return useQuery<CarrierLocations>({
    queryKey: keys.shipping.locations(body?.address_id ?? "", body?.radius_miles),
    queryFn: () => apiRequest<CarrierLocations>("POST", "/shipping/get_locations", body),
    enabled: enabled && !!body?.address_id,
    staleTime: CARRIER_ANSWER_STALE_TIME,
    retry: false,
  });
}

export function useCarrierPickupTimes(body: ShippingCheckPickupBody | null, enabled = true) {
  return useQuery<CarrierPickupWindow[]>({
    queryKey: keys.shipping.pickupTimes(
      body?.address_id ?? "", body?.code ?? "", body?.readyDate ?? ""
    ),
    queryFn: () => apiRequest<CarrierPickupWindow[]>("POST", "/shipping/check_pickup", body),
    enabled: enabled && !!body?.address_id && !!body?.code && !!body?.readyDate,
    staleTime: CARRIER_ANSWER_STALE_TIME,
    retry: false,
  });
}

export function useValidateAddress(body: ShippingValidateAddressBody | null, enabled = true) {
  return useQuery({
    queryKey: keys.shipping.validateAddress(body?.address_id ?? ""),
    queryFn: () => apiRequest("POST", "/shipping/validate_address", body),
    enabled: enabled && !!body?.address_id,
    staleTime: CARRIER_ANSWER_STALE_TIME,
    retry: false,
  });
}

export function useCarriers(enabled = true) {
  return useQuery<CarrierRead[]>({
    queryKey: keys.shipping.carriers(),
    queryFn: () => apiRequest<CarrierRead[]>("GET", "/carriers/get"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useCarrierServices(enabled = true) {
  return useQuery<CarrierServiceRead[]>({
    queryKey: keys.shipping.services(),
    queryFn: () => apiRequest<CarrierServiceRead[]>("GET", "/carrier_services/get"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useCarrierServicesFor(carrier_id: string | null | undefined, enabled = true) {
  return useQuery<CarrierServiceRead[]>({
    queryKey: keys.shipping.servicesByCarrier(carrier_id ?? ""),
    queryFn: () =>
      apiRequest<CarrierServiceRead[]>(
        "GET", "/carrier_services/get_by_carrier", undefined, { carrier_id }
      ),
    enabled: enabled && !!carrier_id,
  });
}

function catalogueWrite<TBody, TResult>(
  client: QueryClient, method: "POST" | "DELETE", url: string
) {
  return {
    mutationFn: async (body: TBody) => await apiRequest<TResult>(method, url, body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.shipping.all(), refetchType: "active" });
    },
  };
}

export function useCreateCarrier() {
  const client = useQueryClient();
  return useMutation(
    catalogueWrite<{ carrier: CarrierPatch }, CarrierRead>(client, "POST", "/carriers/create")
  );
}

export function useUpdateCarrier() {
  const client = useQueryClient();
  return useMutation(
    catalogueWrite<{ carrier: CarrierPatch }, CarrierRead>(client, "POST", "/carriers/update")
  );
}

export function useDeleteCarrier() {
  const client = useQueryClient();
  return useMutation(
    catalogueWrite<{ carrier_id: Carrier["id"] }, boolean>(client, "DELETE", "/carriers/delete")
  );
}

export function useCreateCarrierService() {
  const client = useQueryClient();
  return useMutation(
    catalogueWrite<{ service: CarrierServicePatch }, CarrierServiceRead>(
      client, "POST", "/carrier_services/create"
    )
  );
}

export function useUpdateCarrierService() {
  const client = useQueryClient();
  return useMutation(
    catalogueWrite<{ service: CarrierServicePatch }, CarrierServiceRead>(
      client, "POST", "/carrier_services/update"
    )
  );
}

export function useDeleteCarrierService() {
  const client = useQueryClient();
  return useMutation(
    catalogueWrite<{ id: string }, boolean>(client, "DELETE", "/carrier_services/delete")
  );
}

export function useBuyShipmentLabel(order_id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ shipment_id }: { shipment_id: string }) =>
      await apiRequest<ShipmentView>("POST", `/shipments/${shipment_id}/label`),
    onSuccess: (view) => {
      client.setQueryData(keys.shipping.shipment(view.shipment.id), view);
      if (order_id) client.invalidateQueries({ queryKey: keys.orders.scoped(order_id) });
    },
  });
}
