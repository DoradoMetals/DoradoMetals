import { z } from "zod/v4";
import { AddressesRow } from "../generated/exchange.js";

// What GET /addresses returns. The addresses endpoints select whole rows, so
// the wire shape is the table shape - no nesting, no renames. Stated by
// composition rather than restated by hand, so a column change shows up here.
export const AddressWire = AddressesRow;
export type AddressWire = z.infer<typeof AddressWire>;

// What POST /addresses accepts. The server owns identity and timestamps.
export const CreateAddressBody = AddressesRow.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type CreateAddressBody = z.infer<typeof CreateAddressBody>;

export const UpdateAddressBody = AddressesRow.partial().extend({
  id: z.string().uuid(),
});
export type UpdateAddressBody = z.infer<typeof UpdateAddressBody>;
