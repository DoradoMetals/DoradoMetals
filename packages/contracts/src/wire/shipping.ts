import { z } from "zod/v4";
import {
  CarriersRow,
  CarrierServicesRow,
  ShipmentsRow,
  CarrierPickupsRow,
  TrackingEventsRow,
} from "../generated/tables.js";

export const CarrierWire = CarriersRow;
export type CarrierWire = z.infer<typeof CarrierWire>;

export const CarrierServiceWire = CarrierServicesRow;
export type CarrierServiceWire = z.infer<typeof CarrierServiceWire>;

export const CarrierPickupWire = CarrierPickupsRow;
export type CarrierPickupWire = z.infer<typeof CarrierPickupWire>;

export const TrackingEventWire = TrackingEventsRow;
export type TrackingEventWire = z.infer<typeof TrackingEventWire>;

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
