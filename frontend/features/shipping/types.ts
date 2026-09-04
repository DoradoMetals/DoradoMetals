import type { CarrierHandoff, CarrierServiceOption } from "@dorado/contracts";
// PHASE 3 (ruling 39). What is left in this file is the CARRIER ADAPTER'S
// surface - the shapes FedEx's own API answers in, passed through by
// api/features/shipping/operations/adapters/. Read the notes on each below:
// two of them are deliberately wider than they look, and one of them carries
// a `Date` where the wire carries a string.
//
// WHAT WENT, AND WHY:
//   `Shipment` - THIRTEEN FIELDS OF THE LEGACY EXCHANGE ROW (purchase_order_id,
//   sales_order_id, shipping_label, shipping_charge, shipping_service, package,
//   type), declared here and imported by NOTHING. Every live reader -
//   queries.ts, four order drawers - already takes `Shipment` from
//   @dorado/contracts, which is shipping.shipments verbatim and calls those
//   columns carrier_service_id / label / cost. Two shapes for one table with
//   only one of them connected: ruling 32, the dead one goes.
//
//   `ScanEventItem` and `ShippingCarrierId` stopped being exported. Each is
//   used in exactly one file - this one - which makes it an implementation
//   detail rather than a contract (ruling 38's second arm). `ShippingPackage`
//   - a composed weight+dimensions object - went with streamline B (D214 item
//   11): every rate/pickup/location/validate input takes an id now, never a
//   composed address or package.

// One scan on a tracking record. Used by ShipmentTracking below and nowhere
// else, so it is not exported.
type ScanEventItem = {
  status: string
  location: string
  scan_time: Date
}

export type ShipmentTracking = {
  id: string
  tracking_number: string
  shipping_status: string
  estimated_delivery: Date
  delivered_at: Date
  scan_events: ScanEventItem[]
}

export type ShipmentTrackingInput = {
  shipment_id: string
  tracking_number: string
  carrier_id: string
}

// The carrier's id as the inputs below carry it. One file, not exported.
type ShippingCarrierId = string

// THE CARRIER IS THE SERVER'S TO NAME, NOT THE BROWSER'S.
//
// Rate assembly used to live here: every input carried a required carrier_id,
// and checkout supplied it as the UUID LITERAL
// 30179428-b311-4873-8d08-382901c581d8 at three call sites, one of them with
// `// TODO: source from store when you add carrier selection` beside it. The
// value was right - dev and production both give FedEx that id - but a
// production uuid compiled into a React component is one restore away from
// quoting shipping against a carrier that no longer exists, and nothing would
// report it except a failed checkout.
//
// THE RATE REQUEST ITSELF IS GONE (the rates ruling): GET /checkout/rates
// answers a checkout's already-priced services directly - no address, no
// package, no weight assembled client-side, and `ShippingRatesInput` /
// `ShippingRate` died with the assembly. `CheckoutRate` in
// features/checkout/queries.ts is what a checkout step reads now.
//
// It is optional below. Exactly one carrier has a shipping provider
// implemented, so the API answers "which carrier" itself; admin surfaces that
// DO hold a carrier id (the tracking read, the two cancel mutations) keep
// sending it and keep getting that carrier.

// THE CARRIER'S CATALOGUE COMES FROM @dorado/contracts, not from here.
//
// `CarrierHandoff` (GET /api/shipping/handoffs) and `CarrierServiceOption`
// (GET /api/carrier_services/offered) are wire shapes both halves of the app
// need, so they are declared once in packages/contracts/src/wire/shipping.ts -
// where every field is documented, including why a handoff's `name` is not a
// display string. Re-exported here under the same names so this tree's imports
// read from one place (CLAUDE.md: the frontend keeps local names for UI
// concerns and takes shapes from the contracts).
//
// NOT a fulfillment pickup - see features/handoff/types.ts for the two things
// that share the word. A CarrierHandoff is how a parcel reaches the CARRIER.

export type ShippingPickupTimesInput = {
  carrier_id?: ShippingCarrierId
  address_id: string
  code: string
  readyDate: string
}

export type ShippingPickupTimes = {
  pickupDate: string
  times: string[]
}

export type ShippingLocationsInput = {
  carrier_id?: ShippingCarrierId
  address_id: string
  radius_miles?: number
  max_results?: number
}

export type ShippingLocation = {
  locationId: string
  locationType: string
  distance: { value: number; units: string }
  address: {
    streetLines: string[]
    city: string
    stateOrProvinceCode: string
    postalCode: string
    countryCode: string
  }
  contact: {
    companyName: string
    phoneNumber: string
  }
  operatingHours?: Record<string, string>
  latestExpressDropOffTime?: string
  geoPositionalCoordinates: { latitude: number; longitude: number }
}

export type ShippingLocationsReturn = {
  matchedAddressGeoCoord: { latitude: number; longitude: number }
  locations: ShippingLocation[]
}

export type ShippingValidateAddressInput = {
  carrier_id?: ShippingCarrierId
  address_id: string
}

// `tracking_number` is gone (streamline B): ShippingCancelLabelBody is
// `{ shipment_id, carrier_id? }`.strict() - the wire never carried a tracking
// number here, the server reads it off the shipment row it looks up by id.
export type ShippingCancelLabelInput = {
  carrier_id?: ShippingCarrierId
  shipment_id: string
}

// POST /shipping/cancel_label answers the bare shipping.shipments row after
// patching shipping_status to 'Cancelled' (or null if the shipment id did
// not resolve), not the old { success, shipping_status } message.
// See Shipment in features/shipping/queries.ts.

// `pickup_id` is required and `confirmation_code` is gone (streamline B):
// ShippingCancelPickupBody is `{ pickup_id, carrier_id? }`.strict() - the
// wire never carried a confirmation code, the server reads it off the pickup
// row it looks up by id.
export type ShippingCancelPickupInput = {
  carrier_id?: ShippingCarrierId
  pickup_id: string
}

// POST /shipping/cancel_pickup answers the bare shipping.pickups row (or
// null), not the old { success, status } message. See ShipmentPickup in
// features/shipping/queries.ts.
