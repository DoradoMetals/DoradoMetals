import { z } from "zod/v4";
import { AddressesRow } from "../generated/exchange.js";

// What the wire serves: the postal address ALONE. exchange kept the owner's
// name for it and their default flag on the same row; the new schema splits
// them, and since 2026-08-27 the wire does too - the relationship travels on
// its own endpoint as UserAddress below. The address keeps the id,
// because the id is the handle: remove() and set_default() key on it, and
// the two lists join on it.
export const Address = AddressesRow.omit({
  user_id: true,
  name: true,
  is_default: true,
});
export type Address = z.infer<typeof Address>;

// One person's relationship to one address - ITS OWN WIRE, its own endpoint
// (GET /addresses/get_user_addresses), never nested inside the address. The
// frontend joins the two lists by address_id. No row id: exchange composes
// these from its flat row and has no link id to offer, so the wire carries
// none from either source.
export const UserAddress = z.object({
  address_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  label: z.string().nullable(),
  default_shipping: z.boolean().nullable(),
});
export type UserAddress = z.infer<typeof UserAddress>;

// The flat AddressWire (one row, name / is_default at the top level) and the
// flat Create/UpdateAddressBody lived here until 2026-08-27. Addresses
// converted - the frontend reads and writes this shape - so the flat ones
// retired with the lift adapter, and the -WireNext suffix followed on
// 2026-08-28. An order embeds an address too, but as an immutable SNAPSHOT
// with a recipient; that is OrderAddressSnapshot in orders.ts, its own shape
// on purpose.
