import { z } from "zod/v4";
import {
  CarrierServicesRow,
  ShipmentsRow,
  CarrierPickupsRow,
  TrackingEventsRow,
} from "../generated/exchange.js";

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

// There is deliberately no standalone shipment wire schema. No route returns a
// shipment on its own; the repo's SELECT * reads are internal, and they hand
// back shipping_label as a raw bytea Buffer. Serialising one would produce
// {"type":"Buffer","data":[...]} - half a megabyte across 23 rows, versus 13 KB
// without it. Shipments reach a client only nested on an order, where the query
// base64-encodes the label. That shape is ShipmentOnOrder below.

// How a shipment appears nested inside a purchase order. The renames are
// historical; if the SQL aliases are dropped this collapses to ShipmentsRow.
export const ShipmentOnOrder = ShipmentsRow.omit({
  net_charge: true,
  service_type: true,
  shipping_label: true,
}).extend({
  shipping_charge: z.number().nullable(),
  shipping_service: z.string().nullable(),
  shipping_label: z.string().nullable(), // base64 via encode()
});
export type ShipmentOnOrder = z.infer<typeof ShipmentOnOrder>;
