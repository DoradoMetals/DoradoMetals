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

// ============================================================================
// WRITE BODIES - sourced from the LIVE `places` schema, not `exchange`
// (Address/UserAddress above read from exchange's shape and are left as they
// are; these are new and there is no reason to build them on the stale one).
// ============================================================================
import { AddressesRow as PlacesAddressesRow } from "../generated/places.js";

// POST /places/addresses/create and /update - the postal fields alone.
// is_valid/is_residential are NOT here: db/places/addresses/repo.ts's own
// `NewAddress` never took them from a caller (create.sql hard-codes
// is_valid=true, is_residential=false; validation sets the real values
// through updateValidation, a different write entirely) - a body naming
// either is a 400, not a value quietly overwritten server-side.
export const AddressWrite = PlacesAddressesRow.pick({
  line_1: true,
  line_2: true,
  city: true,
  state: true,
  country: true,
  zip: true,
  country_code: true,
  phone_number: true,
}).partial();
export type AddressWrite = z.infer<typeof AddressWrite>;

// The relationship, beside the address - genuinely new data (a label) plus
// one flag, never an id the caller could instead have sent (ruling 43): the
// address_id is the one just created/named, the user_id is the session's.
export const UserAddressWrite = z.object({
  label: z.string().nullable().optional(),
  default_shipping: z.boolean().optional(),
}).strict();
export type UserAddressWrite = z.infer<typeof UserAddressWrite>;

// `user_id` is an ID for what the server holds (ruling 43), not new data: an
// admin naming another customer's book (the customer drawer does this); a
// non-admin caller sending one is silently overridden by the session
// (subjectOf, transport/places/addresses/controller.ts) - present on every
// write body for the same reason it is accepted on the two read endpoints.
const adminNamedUser = { user_id: z.string().uuid().optional() };

// POST /places/addresses/create - a first-time address. No id: the service
// generates one (db/places/addresses/repo.ts's create() never reads a
// caller-supplied id either).
export const AddressCreateBody = z.object({
  address: AddressWrite.strict(),
  user_address: UserAddressWrite.optional(),
  ...adminNamedUser,
}).strict();
export type AddressCreateBody = z.infer<typeof AddressCreateBody>;

// POST /places/addresses/update - the same, keyed by the existing address's id.
export const AddressUpdateBody = z.object({
  address: AddressWrite.extend({ id: PlacesAddressesRow.shape.id }).strict(),
  user_address: UserAddressWrite.optional(),
  ...adminNamedUser,
}).strict();
export type AddressUpdateBody = z.infer<typeof AddressUpdateBody>;

// DELETE /places/addresses/delete and POST /places/addresses/set_default -
// the id alone (ruling 43); the composed `{address, address_id}` fallback
// body is gone; the frontend sends `address_id`.
export const AddressIdBody = z.object({
  address_id: PlacesAddressesRow.shape.id,
  ...adminNamedUser,
}).strict();
export type AddressIdBody = z.infer<typeof AddressIdBody>;
