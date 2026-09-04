"use client";

// PARCELS AND CARRIERS. One hook per endpoint, typed only from
// @dorado/contracts.
//
// `useShipment` and `useOrderShipments` answer the ShipmentView: the row, the
// service and box it names by id, its carrier booking, its progress timeline
// and `actions`. Three client-side joins died with it - the service lookup
// that resolved a parcel's name and carrier, the package lookup behind the
// packing copy, and the separate call for a carrier booking every caller read
// `[0]` of - along with the forty lines that turned raw scan rows into a
// progress ladder.
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

// Reference data, cached hard: a handful of rows each, changing when the
// business changes carriers. Same treatment the metals and mints lists get.
const REFERENCE_STALE_TIME = 60 * 60 * 1000;

// A carrier's answer about a real address costs a call, so it is cached for a
// few minutes and never retried: a refusal is about the address, and asking
// again gets the same refusal.
const CARRIER_ANSWER_STALE_TIME = 5 * 60 * 1000;

// The view is authoritative for its parcel; the order's list carries the same
// row and is re-read.
function absorb(client: QueryClient, view: ShipmentView | null): ShipmentView | null {
  if (view) client.setQueryData(keys.shipping.shipment(view.shipment.id), view);
  client.invalidateQueries({ queryKey: keys.shipping.all(), refetchType: "active" });
  return view;
}

// ------------------------------------------------------------- the parcels

// GET /api/shipments/:id - ONE PARCEL, WHOLE. Owner-or-admin.
export function useShipment(shipment_id: string | null | undefined, enabled = true) {
  return useQuery<ShipmentView>({
    queryKey: keys.shipping.shipment(shipment_id ?? ""),
    queryFn: () => apiRequest<ShipmentView>("GET", `/shipments/${shipment_id}`),
    enabled: enabled && !!shipment_id,
  });
}

// GET /api/orders/:orderId/shipments - both directions in one array; the
// caller filters on `shipment.direction`. There are no shipment /
// return_shipment slots and never were in the table.
export function useOrderShipments(order_id: string | null | undefined, enabled = true) {
  return useQuery<ShipmentView[]>({
    queryKey: keys.shipping.forOrder(order_id ?? ""),
    queryFn: () => apiRequest<ShipmentView[]>("GET", `/orders/${order_id}/shipments`),
    enabled: enabled && !!order_id,
  });
}

// The parcel the customer sent us (or that we sent out) as against the one
// coming BACK - the two halves the old slot names encoded, now a filter on the
// row's own column.
export const outboundOf = (views: ShipmentView[] = []): ShipmentView | undefined =>
  views.find((v) => v.shipment.direction !== "Return");
export const returnOf = (views: ShipmentView[] = []): ShipmentView | undefined =>
  views.find((v) => v.shipment.direction === "Return");

// POST /shipping/get_tracking - a WRITE dressed as a read: it asks the carrier
// and replaces the parcel's scan history with the answer, so it is a mutation
// and never polls. It answers the refreshed ShipmentView.
export function useRefreshTracking() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ shipment_id }: { shipment_id: string }) =>
      await apiRequest<ShipmentView | null>("POST", "/shipping/get_tracking", { shipment_id }),
    onSuccess: (view) => absorb(client, view),
  });
}

// PATCH /api/shipments/:id - the parcel's money and its hand-entered tracking
// pair. Admin. Answers the whole view.
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

// --------------------------------------------------- the carrier's own words

// HOW A PARCEL REACHES THE CARRIER - the customer drops it off, or the courier
// collects. NOT a fulfillment pickup: that is us collecting the metal.
// Neither this nor the service list takes a carrier id; exactly one carrier has
// a provider implemented, so the server answers "which carrier" itself. That is
// what let a production uuid literal come out of three React components.
export function useCarrierHandoffs(enabled = true) {
  return useQuery<CarrierHandoff[]>({
    queryKey: keys.shipping.handoffs(),
    queryFn: () => apiRequest<CarrierHandoff[]>("GET", "/shipping/handoffs"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

// The services checkout offers, in the order they render, with the codes a rate
// quote and a pickup-availability check are keyed by.
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

// THE SALE DELIVERY OPTIONS: the business's own carrier-agnostic priced rows.
// The customer picks the SERVICE at its fixed price; the refinery picks the
// carrier. PUBLIC, like the endpoint - the product page shows these prices to
// signed-out visitors. Prices here are DISPLAY; the server's own pricing
// remains the authority.
export function useSaleShippingServices(enabled = true) {
  return useQuery<SaleShippingService[]>({
    queryKey: keys.shipping.saleOptions(),
    queryFn: () => apiRequest<SaleShippingService[]>("GET", "/carrier_services/sale_options"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

// ----------------------------------------------- asking a carrier something

// Every one of these names an ADDRESS BY ID (ruling 43): the server resolves
// it, so a quote cannot be asked about somewhere the caller does not hold on
// file. `carrier_id` is optional on all of them.
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

// ------------------------------------------------------ the admin catalogue

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

// A create and an update take the SAME patch (there is no New<Entity>); the id
// is what names an existing row.
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
