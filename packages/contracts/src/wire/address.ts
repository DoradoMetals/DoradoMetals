import { z } from "zod/v4";
import { AddressesRow } from "../generated/exchange.js";

// What the repos return: the postal address, with a person's relationship to it
// kept apart.
//
// exchange keeps both on one row - `name` is what the owner calls it and
// `is_default` is their preference, neither of which is a property of the
// address. The new schema splits them, which is what lets an order snapshot an
// address without copying whose it was.
//
// The address keeps the id, because the id is the handle: remove() and
// setDefault() key on it.
export const AddressWireNext = AddressesRow.omit({
  user_id: true,
  name: true,
  is_default: true,
}).extend({
  user_address: z.object({
    user_id: z.string().uuid().nullable(),
    label: z.string().nullable(),
    default_shipping: z.boolean().nullable(),
  }),
});
export type AddressWireNext = z.infer<typeof AddressWireNext>;

// What the frontend still reads: one flat row. Produced by
// features/addresses/wire.js behind ADDRESSES_WIRE=legacy. A flatten rather than
// a rename, so it is stated rather than derived.
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
