import { z } from "zod/v4";
import { SuppliersRow } from "../generated/exchange.js";

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
export const RefinerWireNext = z.object({
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
export type RefinerWireNext = z.infer<typeof RefinerWireNext>;

// What the frontend still reads: flat, with is_active rather than enabled.
//
// Produced by features/refiners/wire.js on the way out, behind
// REFINERS_WIRE=legacy. Unlike products and media this is a flatten rather than
// a rename, so it is stated rather than derived - there is no mechanical
// relationship between the two to lean on, which is exactly what makes it a
// transformation.
export const RefinerWire = SuppliersRow;
export type RefinerWire = z.infer<typeof RefinerWire>;
