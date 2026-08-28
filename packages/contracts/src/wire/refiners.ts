import { z } from "zod/v4";
import { ItemsRow, OrdersRow, SpotsRow } from "../generated/refiners.js";

// What the repos return: a refiner, and the organization it is, kept apart.
//
// A supplier is two rows in the new schema and the response says so rather than
// smearing the organization's fields across the top level. exchange holds them
// in one flat row and composes this shape out of it, so both implementations
// produce the same thing and the diff can compare them.
//
// organization.id has no equivalent in exchange - an organization is a new
// concept and the migration issued its id - so exchange composes without one.
// The supplier's own id is unchanged and is what everything references.
export const Refiner = z.object({
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
export type Refiner = z.infer<typeof Refiner>;

// The legacy RefinerWire (the flat SuppliersRow, is_active rather than
// enabled) lived here until 2026-08-28. Refiners converted and the flatten
// adapter died with the wire axis; the schema retired when the last legacy
// vocabulary went. This shape carried the -WireNext suffix until the same
// day: one shape, one name.

// The refiner ENGAGEMENT on a customer order (093), addressed by the order:
// GET /orders/:orderId/refiners. The VERBATIM refiners.orders row
// (ruling 12); its own id is the key PATCH /refiners/orders/:id takes.
export const RefinerOrder = OrdersRow;
export type RefinerOrder = z.infer<typeof RefinerOrder>;

// GET /orders/:orderId/refiners/spots - the refinery's quoted spots
// as VERBATIM refiners.spots rows. The metal is its id; display names come
// from the spots reference read, client-side.
export const RefinerSpot = SpotsRow;
export type RefinerSpot = z.infer<typeof RefinerSpot>;

// GET /orders/:orderId/refiners/items - the refinery's numbers PER CUSTOMER
// LINE, as VERBATIM refiners.items rows, keyed by order_item_id.
//
// The assay report lives here. It rode on the composed order as
// scrap.purity_actual / post_melt_actual / content_actual, and the refiner's
// premium as a field of the customer's line - four values of another table
// wearing customer-facing names. What the customer was quoted and what the
// refinery reported are different facts and are now different reads.
export const RefinerItem = ItemsRow;
export type RefinerItem = z.infer<typeof RefinerItem>;
