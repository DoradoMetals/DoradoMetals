import { z } from "zod/v4";
import {
  CarrierServicesRow,
  CarrierPickupsRow,
  TrackingEventsRow,
} from "../generated/exchange.js";
import {
  ShipmentsRow,
  PickupsRow as ShipmentPickupsRow,
} from "../generated/shipping.js";

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

export const CarrierPickup = CarrierPickupsRow;
export type CarrierPickup = z.infer<typeof CarrierPickup>;

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
