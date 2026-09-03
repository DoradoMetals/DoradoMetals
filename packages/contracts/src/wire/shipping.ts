import { z } from "zod/v4";
import {
  CarrierServicesRow,
  TrackingEventsRow,
} from "../generated/exchange.js";
import {
  CarriersRow,
  ServicesRow,
  ShipmentsRow,
  PackagesRow,
  PickupsRow as ShipmentPickupsRow,
  Direction as ShippingDirection,
} from "../generated/shipping.js";
import { OrganizationsRow } from "../generated/organizations.js";
import { AddressesRow } from "../generated/places.js";

// The repos return a carrier and the organization it is, kept apart - the same
// shape as Refiner, because a carrier and a refiner are the same kind of thing
// in the new design: an organization with a role.
export const Carrier = z.object({
  id: z.string().uuid(),
  logo: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  organization: z.object({
    id: z.string().uuid().optional(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    enabled: z.boolean().nullable(),
  }),
});
export type Carrier = z.infer<typeof Carrier>;

// The legacy CarrierWire (the flat CarriersRow) lived here until 2026-08-28.
// Carriers converted and the flatten adapter died with the wire axis; the
// schema retired when the last legacy vocabulary went. The shape above
// carried the -WireNext suffix until the same day: one shape, one name.

export const CarrierService = CarrierServicesRow;
export type CarrierService = z.infer<typeof CarrierService>;

// CarrierPickup (exchange.carrier_pickups' own hand-curated shape, order_id/
// user_id/carrier reconstructed through the shipment) is RETIRED, D214:
// shipping.pickups' reads are bare rows now - see ShipmentPickup below, which
// GET /carrier_pickups is validated against too.

export const TrackingEvent = TrackingEventsRow;
export type TrackingEvent = z.infer<typeof TrackingEvent>;

// GET /orders/:orderId/shipments - THE PARCELS OF ONE ORDER, VERBATIM
// shipping.shipments rows, BOTH DIRECTIONS IN ONE ARRAY.
//
// This is what retired ShipmentOnOrder and, with it, the shipment /
// return_shipment slot pair on the order wire (wave 3). Two named members
// built by branching on a column the row already carries were two names for
// one table; the frontend filters on `direction` - shipping.direction, whose
// values are Inbound / Outbound / Return, NOT orders.direction's
// purchase / sale.
//
// The historical renames went with it: net_charge / service_type became
// shipping_charge / shipping_service on the way into an order, and the row's
// own names are `cost` and a `carrier_service_id` the client maps against the
// cached /carrier_services list. `label` is TEXT in this schema - the bytea
// and its base64 wrapping were exchange's.
export const Shipment = ShipmentsRow;
export type Shipment = z.infer<typeof Shipment>;

// GET /shipments/:shipmentId/pickups - the CARRIER pickups booked against one
// parcel, VERBATIM shipping.pickups rows.
//
// The parent is the SHIPMENT, which is what the column says
// (shipping.pickups.shipment_id); the composed order hung a single
// `carrier_pickup` off the ORDER, which was a grandchild read keyed on the
// wrong parent and one row where the table allows several. Not to be confused
// with FulfillmentPickup - us collecting from a customer is a different act in
// a different table.
export const ShipmentPickup = ShipmentPickupsRow;
export type ShipmentPickup = z.infer<typeof ShipmentPickup>;

// ============================================================================
// THE CARRIER'S OWN CATALOGUE - reference reads with no table behind them.
// ============================================================================
//
// GET /api/shipping/handoffs and GET /api/carrier_services/offered. Both were
// HAND-WRITTEN IN THE BROWSER until wave 5B: `pickupOptions` keyed by
// DROPOFF_AT_FEDEX_LOCATION / CONTACT_FEDEX_TO_SCHEDULE, and `serviceOptions`
// keyed by FEDEX_EXPRESS_SAVER / PRIORITY_OVERNIGHT carrying FedEx's FDXE code,
// with three checkout components branching on those strings. The API owns a
// carrier's vocabulary; the frontend renders `name`, branches on the flags, and
// hands `code` back without reading it (ruling 12, rows out and ids in).
//
// THEY ARE NOT DERIVED FROM A TABLE, and that is measured rather than assumed:
// shipping.services exists and would be the right source, but `code` and
// `provider_code` are NULL on all eight rows in production AND all eight in
// dev, so no row can say which carrier service it means. Filling them is an
// UPDATE against production. Until then the values live with the carrier's
// adapter (api/features/shipping/operations/adapters/) and these describe the
// shape they are served in - so populating the columns later changes the read's
// SOURCE and not its SURFACE.
//
// They are declared here rather than in either half because they were declared
// TWICE the moment the read existed - once for the service, once for the hook -
// and two hand-written copies of one wire shape is the defect the contracts
// package exists to prevent.

// HOW A PARCEL REACHES THE CARRIER: the customer drops it at the carrier's
// location, or the carrier collects it.
//
// *** NOT FulfillmentPickup. *** Two different things share the word "pickup"
// (Jacob, correcting the coordinator): fulfillments.pickups is DORADO
// collecting the metal itself, a fulfillment METHOD; this is THE CARRIER's, a
// property of a SHIPMENT (shipping.shipments.pickup_type). The database keeps
// them apart and nothing may merge them.
export const CarrierHandoff = z.object({
  // The carrier's own value. Round-tripped by the client into the label
  // request; never interpreted by it.
  code: z.string(),
  // What a customer reads - AND what lands in shipments.pickup_type verbatim,
  // which is why it is not a client-side label. features/orders/intake.ts
  // indexes its handoff table BY THIS STRING and throws on one it does not
  // know, features/orders/service.ts books a courier when it is
  // "Carrier Pickup", and features/media/pdfs branches a packing list on
  // "Store Dropoff". Three readers, no constraint between them; pinned by
  // api/features/shipping/handoffs/tests/unit.test.ts.
  name: z.string(),
  // The client collects a date and a time slot for this option.
  requires_schedule: z.boolean(),
  // The client shows a map of places the parcel may be left.
  has_dropoff_locations: z.boolean(),
  display_order: z.number(),
});
export type CarrierHandoff = z.infer<typeof CarrierHandoff>;

// A SERVICE WE OFFER AT CHECKOUT, which is not the same list as
// shipping.services holds - eight rows across two carriers, two of them
// offered. `code` matches a rate quote's serviceType, which is how the selector
// joins the catalogue to live prices; `carrier_code` is the service FAMILY a
// pickup-availability check wants (FDXE express, FDXG ground), a property of
// the service and not of the carrier.
export const CarrierServiceOption = z.object({
  // The shipping.services ROW this catalogue entry corresponds to (D208):
  // what the checkout row stores as carrier_service_id, joined by name the
  // same way the ceiling is. Null only if the table lost the row.
  id: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  carrier_code: z.string(),
  display_order: z.number(),
  // THE ONE FIELD HERE THAT IS A ROW AND NOT A CONSTANT (migration 097).
  //
  // What Dorado will insure a parcel moving on this service for, in USD -
  // `shipping.services.max_insured_value`, joined onto the adapter's catalogue
  // by (carrier_id, name) because `code` is still NULL on every row (D125).
  // NOT the carrier's own ceiling: FedEx allows $50,000, this is 10,000
  // (Jacob, 2026-08-29).
  //
  // *** THE CLIENT MUST NOT CLAMP WITH IT. *** This number is here so a screen
  // can SAY what a parcel is covered for. The clamp itself is applied by the
  // server, in /quotes/purchase_order and again when the label is bought -
  // `Math.min(quote.declared_value, 50000)` in checkoutStepper.tsx is the
  // defect 097 removes (D132, and D82: the frontend computes no money).
  max_insured_value: z.number(),
});
export type CarrierServiceOption = z.infer<typeof CarrierServiceOption>;

// ============================================================================
// WRITE BODIES - a carrier is an organization (type CARRIER) plus a
// shipping.carriers row (domain/shipping/carriers/service.ts). `organization`
// is genuinely new data (ruling 43: a first-time name/email/phone), never an
// id - carriers.repo.ts's `create()`/`update()` write the organization
// columns directly from what the body sends, there is no lookup to replace.
// ============================================================================

const CarrierOrganizationWrite = OrganizationsRow.pick({
  name: true,
  email: true,
  phone: true,
  enabled: true,
}).partial();

// POST /carriers/create.
export const CarrierCreate = z.object({
  logo: CarriersRow.shape.logo.optional(),
  organization: CarrierOrganizationWrite.strict().optional(),
}).strict();
export type CarrierCreate = z.infer<typeof CarrierCreate>;

// POST /carriers/update - the same, keyed by the existing carrier's id.
export const CarrierPatch = CarrierCreate.extend({
  id: CarriersRow.shape.id,
});
export type CarrierPatch = z.infer<typeof CarrierPatch>;

// DELETE /carriers/delete - the id alone.
export const CarrierDeleteBody = z.object({
  carrier_id: CarriersRow.shape.id,
}).strict();
export type CarrierDeleteBody = z.infer<typeof CarrierDeleteBody>;

// POST /carrier_services/create and /update - shipping.services' writable
// columns (db/shipping/services/repo.ts's ServiceWrite), with the three
// fields the wire has always aliased kept under those names
// (supports_pickup/supports_dropoff/max_weight_lbs - "the legacy spellings
// some tables still alias to are the wire's, kept on purpose", CLAUDE.md).
// created_by/updated_by/timestamps/max_insured_value/price/display are not
// here: none of them is a column create()/update() ever wrote.
const ServiceFields = ServicesRow.omit({
  id: true,
  created_at: true,
  updated_at: true,
  created_by: true,
  updated_by: true,
  created_by_id: true,
  updated_by_id: true,
  supports_pickups: true,
  supports_dropoffs: true,
  max_weight_lb: true,
  max_insured_value: true,
  price: true,
  display: true,
}).extend({
  supports_pickup: ServicesRow.shape.supports_pickups,
  supports_dropoff: ServicesRow.shape.supports_dropoffs,
  max_weight_lbs: ServicesRow.shape.max_weight_lb,
}).partial({
  carrier_id: true,
  description: true,
  code: true,
  provider_code: true,
  supports_pickup: true,
  supports_dropoff: true,
  supports_returns: true,
  supports_insurance: true,
  is_international: true,
  is_residential: true,
  is_active: true,
  max_weight_lbs: true,
  max_length_in: true,
  max_width_in: true,
  max_height_in: true,
  max_declared_value: true,
  min_transit_days: true,
  max_transit_days: true,
  display_order: true,
});

export const CarrierServiceCreate = ServiceFields.strict();
export type CarrierServiceCreate = z.infer<typeof CarrierServiceCreate>;

export const CarrierServicePatch = ServiceFields.extend({
  id: ServicesRow.shape.id,
}).strict();
export type CarrierServicePatch = z.infer<typeof CarrierServicePatch>;

// DELETE /carrier_services/delete - the id alone.
export const CarrierServiceDeleteBody = z.object({
  id: ServicesRow.shape.id,
}).strict();
export type CarrierServiceDeleteBody = z.infer<typeof CarrierServiceDeleteBody>;

// ============================================================================
// OPERATIONS - the seven carrier-facing bodies (D214 item 11: "the contracts
// lane deferred shipping/operations' seven bodies... do them now"). Every one
// takes ids for what the server holds - an address, a package, a shipment, a
// pickup - plus genuinely new numbers (a weight, a radius); never a composed
// address or package object from the client. domain/shipping/operations
// resolves each id to the row the carrier adapter needs.
// ============================================================================

// POST /shipping/validate_address
export const ShippingValidateAddressBody = z.object({
  carrier_id: CarriersRow.shape.id.optional(),
  address_id: AddressesRow.shape.id,
}).strict();
export type ShippingValidateAddressBody = z.infer<typeof ShippingValidateAddressBody>;

// POST /shipping/get_rates - shippingType picks which side of the quote
// address_id names: the shipper's for an Inbound parcel (the customer sends
// to us), otherwise ignored server-side (Outbound/Return ship FROM our own
// address, see domain/shipping/operations/service.ts). package_id is the box;
// weight is the one genuine measurement nothing else stores.
export const ShippingGetRatesBody = z.object({
  carrier_id: CarriersRow.shape.id.optional(),
  shippingType: ShippingDirection,
  address_id: AddressesRow.shape.id,
  package_id: PackagesRow.shape.id,
  weight: z.number(),
  pickupType: z.string().optional(),
  declaredValue: z.number().optional(),
}).strict();
export type ShippingGetRatesBody = z.infer<typeof ShippingGetRatesBody>;

// POST /shipping/check_pickup - readyDate is a date-time string; the
// controller converts it to the Date the provider call needs.
export const ShippingCheckPickupBody = z.object({
  carrier_id: CarriersRow.shape.id.optional(),
  address_id: AddressesRow.shape.id,
  code: z.string(),
  readyDate: z.string(),
}).strict();
export type ShippingCheckPickupBody = z.infer<typeof ShippingCheckPickupBody>;

// POST /shipping/get_locations
export const ShippingGetLocationsBody = z.object({
  carrier_id: CarriersRow.shape.id.optional(),
  address_id: AddressesRow.shape.id,
  radius_miles: z.number().optional(),
  max_results: z.number().optional(),
}).strict();
export type ShippingGetLocationsBody = z.infer<typeof ShippingGetLocationsBody>;

// POST /shipping/get_tracking
export const ShippingGetTrackingBody = z.object({
  shipment_id: ShipmentsRow.shape.id,
}).strict();
export type ShippingGetTrackingBody = z.infer<typeof ShippingGetTrackingBody>;

// POST /shipping/cancel_label
export const ShippingCancelLabelBody = z.object({
  shipment_id: ShipmentsRow.shape.id,
  carrier_id: CarriersRow.shape.id.optional(),
}).strict();
export type ShippingCancelLabelBody = z.infer<typeof ShippingCancelLabelBody>;

// POST /shipping/cancel_pickup
export const ShippingCancelPickupBody = z.object({
  pickup_id: ShipmentPickupsRow.shape.id,
  carrier_id: CarriersRow.shape.id.optional(),
}).strict();
export type ShippingCancelPickupBody = z.infer<typeof ShippingCancelPickupBody>;
