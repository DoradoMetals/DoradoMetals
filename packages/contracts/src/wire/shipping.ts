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
