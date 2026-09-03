import {
  CarrierHandoff,
  CarrierServiceOption,
  ShipmentTracking,
  ShipmentTrackingInput,
  ShippingCancelLabelInput,
  ShippingCancelPickupInput,
  ShippingLocationsInput,
  ShippingLocationsReturn,
  ShippingPickupTimes,
  ShippingPickupTimesInput,
  ShippingRate,
  ShippingRatesInput,
  ShippingValidateAddressInput,
} from '@/features/shipping/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import { useCarrierServices } from '@/features/carriers/queries'
import { invalidateOrderReads } from '@/features/orders/invalidation'
import type { Shipment, ShipmentPatch, ShipmentPickup, shipping } from '@dorado/contracts'

// THE ORDER'S PARCELS, BOTH DIRECTIONS IN ONE ARRAY (wave 3):
// GET /orders/:orderId/shipments, verbatim shipping.shipments rows. This is
// what replaced order.shipment and order.return_shipment - two named slots
// for one table that carries its own `direction` column (Inbound / Outbound /
// Return). Filter on it; do not go looking for the slots.
//
// The renames went with the slots. `est_delivery` not estimated_delivery,
// `cost` not shipping_charge, `label` not shipping_label, `direction` not
// type; the package and the service are ids the client maps against the
// cached /shipping package and /carrier_services lists. Owner-or-admin
// server-side - a customer tracks their own parcel.
export type { Shipment, ShipmentPickup } from '@dorado/contracts'

export const useOrderShipments = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<Shipment[]>({
    queryKey: ['order_shipments', order_id],
    queryFn: async () => await apiRequest<Shipment[]>('GET', `/orders/${order_id}/shipments`),
    enabled: !!user && !!order_id,
  })
}

// THE SHIPMENT'S DISPLAY FIELDS, MAPPED CLIENT-SIDE (ruling 12). A
// shipping.shipments row names its service and its box by ID; the composed
// wire smeared the service's NAME on as `shipping_service` and the package's
// LABEL as `package`. Both are reference lists the app already caches, so
// this is one hook every drawer calls instead of eight copies of the same
// two `find`s.
//
// carrier_id is the same kind of thing: it is not a column of the shipment
// at all in the new schema - the SERVICE knows its carrier - and useTracking
// and the two cancel mutations need it, so it is resolved here too.
export const useShipmentDisplay = (shipment: Shipment | null | undefined) => {
  const { data: services = [] } = useCarrierServices()
  const service = services.find((s) => s.id === shipment?.carrier_service_id) ?? null

  return {
    service_name: service?.name ?? null,
    carrier_id: service?.carrier_id ?? null,
  }
}

// The parcel a customer sent us (or that we sent out) as against the one
// coming BACK - the two halves the old slot names encoded, now a filter.
export const outboundOf = (shipments: Shipment[] = []) =>
  shipments.find((s) => s.direction !== 'Return')
export const returnOf = (shipments: Shipment[] = []) =>
  shipments.find((s) => s.direction === 'Return')

// The CARRIER pickups booked against one parcel - GET /shipments/:id/pickups.
// The parent is the shipment, which is what shipping.pickups.shipment_id
// says; the composed order hung a single `carrier_pickup` off the ORDER,
// which was the wrong parent and one row where the table allows several.
export const useShipmentPickups = (shipment_id: string | null | undefined) => {
  const { user } = useGetSession()

  return useQuery<ShipmentPickup[]>({
    queryKey: ['shipment_pickups', shipment_id],
    queryFn: async () =>
      await apiRequest<ShipmentPickup[]>('GET', `/shipments/${shipment_id}/pickups`),
    enabled: !!user && !!shipment_id,
  })
}

// THE CARRIER'S OWN VOCABULARY, READ RATHER THAN SPELLED.
//
// These two are the whole point of wave 5B. The browser used to declare a
// carrier's handoff types (DROPOFF_AT_FEDEX_LOCATION / CONTACT_FEDEX_TO_SCHEDULE)
// and its service types (FEDEX_EXPRESS_SAVER / PRIORITY_OVERNIGHT, plus the
// FDXE carrier code) as hand-written literals, and three checkout components
// branched on those strings. The API owns the carrier; the frontend renders
// what it is given and hands back a code it does not interpret - ruling 12,
// rows out and ids in.
//
// NEITHER TAKES A CARRIER ID. Exactly one carrier has a shipping provider
// implemented, so the server resolves which one; that is what let a production
// uuid literal come out of three React components.
//
// Reference data, cached hard: eleven and two rows respectively, changing when
// the business changes carriers. Same treatment the metals and mints lists get.
const REFERENCE_STALE_TIME = 60 * 60 * 1000

export const useCarrierHandoffs = () =>
  useApiQuery<CarrierHandoff[]>({
    key: queryKeys.carrierHandoffs(),
    url: '/shipping/handoffs',
    requireUser: true,
    staleTime: REFERENCE_STALE_TIME,
  })

export const useCarrierServiceOptions = () =>
  useApiQuery<CarrierServiceOption[]>({
    key: queryKeys.carrierServiceOptions(),
    url: '/carrier_services/offered',
    requireUser: true,
    staleTime: REFERENCE_STALE_TIME,
  })

// THE SALE DELIVERY OPTIONS (D208): the business's own carrier-agnostic
// priced service rows - Standard $25 / Overnight $50 / the admin's Free
// grant. Jacob: the customer picks the SERVICE at its fixed price; the
// refinery picks the carrier, recorded on the shipment. Customer surfaces
// filter to `display`; the admin drawer offers all. Prices here are DISPLAY -
// the server's getShippingCharge remains the pricing authority, and
// api/features/pricing/tests/reference-drift pins the two together.
export type SaleShippingService = Pick<
  shipping.ServicesRow,
  'id' | 'name' | 'code' | 'price' | 'display' | 'is_active' | 'min_transit_days' | 'max_transit_days'
>

export const useSaleShippingServices = () =>
  useApiQuery<SaleShippingService[]>({
    key: queryKeys.saleShippingServices(),
    url: '/carrier_services/sale_options',
    // Public, like the endpoint: the product page shows these prices to
    // signed-out visitors.
    requireUser: false,
    staleTime: REFERENCE_STALE_TIME,
  })

// ShipmentTrackingInput still carries tracking_number/carrier_id - not for
// the wire (ShippingGetTrackingBody is `{ shipment_id }`.strict() now, the
// server reads both off the shipment row it looks up by id) but as the
// client-side gate: no point asking the carrier to track a shipment that has
// no label yet. Sending them anyway used to just get ignored by an
// unvalidated `req.body` destructure; strict parsing 400s on them now.
export const useTracking = (input: ShipmentTrackingInput) => {
  return useApiQuery<ShipmentTracking | null>({
    key: queryKeys.shipmentTracking(input),
    url: '/shipping/get_tracking',
    method: 'POST',
    requireUser: true,
    enabled: (user) =>
      !!user?.id && !!input.shipment_id && !!input.tracking_number && !!input.carrier_id,
    body: () => ({
      shipment_id: input.shipment_id,
    }),
  })
}

export const useShippingRates = (input: ShippingRatesInput | null) =>
  useApiQuery<ShippingRate[]>({
    key: queryKeys.shippingRates(input ?? ({} as any)),
    method: 'POST',
    url: '/shipping/get_rates',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input!,
  })

export const useShippingPickupTimes = (input: ShippingPickupTimesInput) =>
  useApiQuery<ShippingPickupTimes[]>({
    key: queryKeys.shippingPickupTimes(input),
    method: 'POST',
    url: '/shipping/check_pickup',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })

export const useShippingLocations = (input: ShippingLocationsInput) =>
  useApiQuery<ShippingLocationsReturn>({
    key: queryKeys.shippingLocations(input),
    method: 'POST',
    url: '/shipping/get_locations',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })

export const useShippingValidateAddress = (input: ShippingValidateAddressInput) =>
  useApiQuery({
    key: queryKeys.shippingValidateAddress(input),
    method: 'POST',
    url: '/shipping/validate_address',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })

export const useShippingCancelLabel = () => {
  return useApiMutation<Shipment | null, ShippingCancelLabelInput>({
    queryKey: queryKeys.shippingCancelLabel(),
    url: '/shipping/cancel_label',
    method: 'POST',
    requireAdmin: true,
    body: input => input,
  })
}

export const useShippingCancelPickup = () => {
  return useApiMutation<ShipmentPickup | null, ShippingCancelPickupInput>({
    queryKey: queryKeys.shippingCancelPickup(),
    url: '/shipping/cancel_pickup',
    method: 'POST',
    requireAdmin: true,
    // Was `({ input })` - nesting the whole body under an `input` key that
    // ShippingCancelPickupBody has no field for. Unvalidated parsing let it
    // through as a no-op-looking body (the destructure just found nothing);
    // strict parsing 400s: no top-level key, and the required `pickup_id`
    // missing too.
    body: (input) => input,
  })
}

// The shipment as its own resource (D87, per-resource form): everything on
// the shipment row - the estimated and actual charge, and the tracking pair -
// writes here, keyed by order.shipment.id off the order wire, whichever
// direction the order is. Admin-only. Settles through the one order cache
// policy: the shipment's figures render inside order reads and price the
// quote.
// THE REQUEST BODY IS THE CONTRACT'S NOW (phase 3, A3). It was declared here
// AND in api/features/shipping/shipments/patch.service.ts, and the two
// disagreed on `shipping_charge`: the API said `number | null`, this said
// `number`, so the API advertised a CLEAR no client could compile a call to.
// The null is gone rather than this widened - nothing under the API ever
// honoured it (editShippingCharge takes `number`), and null and 0 price
// identically because every reader is `?? 0`. "Free" is 0.
export type { ShipmentPatch } from '@dorado/contracts'

type PatchShipmentVars = {
  shipment_id: string
  // For the caches; the URL does not carry it.
  order_id: string
  patch: ShipmentPatch
}

export const usePatchShipment = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ shipment_id, patch }: PatchShipmentVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<unknown>('PATCH', `/shipments/${shipment_id}`, patch)
    },
    onSettled: (_data, _err, { order_id }) => {
      invalidateOrderReads(queryClient, order_id)
    },
  })
}
