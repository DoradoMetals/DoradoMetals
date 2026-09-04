import { z } from "zod/v4";
import { Address, AddressPatch } from "../places/addresses.js";
import { UserAddressRead } from "../places/user_addresses.js";

// computed: no table backs any of these.
//
// AN ADDRESS BOOK ENTRY spans two tables and a question neither answers - can
// this address still be touched. A card in the browser used to decide that for
// itself (it did not: it offered Edit and Remove always, and the API refused
// with a 409 the card then rendered as red text). The rule is one place now,
// and the button an entry OFFERS is a call the use case ACCEPTS.

// WHAT MAY BE DONE TO AN ENTRY.
//
//   edit         PATCH /api/addresses/:id - refused while an unfinished order
//                depends on this address, because the parcel is already going
//                somewhere
//   remove       DELETE /api/addresses/:id - refused for the same reason
//   set_default  POST /api/addresses/:id/default - false when it already is
export const AddressBookActions = z.object({
  edit: z.boolean(),
  remove: z.boolean(),
  set_default: z.boolean(),
});
export type AddressBookActions = z.infer<typeof AddressBookActions>;

// ROWS, NOT PROJECTIONS. `address` is the postal row itself and `user_address`
// the link row - the two stay apart on the wire, because a link nested inside
// an address is exactly the smearing the places split exists to end.
export const AddressBookEntry = z.object({
  address: Address,
  user_address: UserAddressRead,
  actions: AddressBookActions,
});
export type AddressBookEntry = z.infer<typeof AddressBookEntry>;

// ONE SUGGESTION FROM THE PLACES PROVIDER. Google's own response is a deep
// object with four spellings of the same string; this is what survives the
// adapter, and it is all any caller ever read.
export const PlaceSuggestion = z.object({
  place_id: z.string(),
  main: z.string(),
  secondary: z.string().nullable(),
});
export type PlaceSuggestion = z.infer<typeof PlaceSuggestion>;

// ONE SUGGESTION, RESOLVED. The postal fields the provider's components parse
// into - the same patch a create would send, so the form fills straight from
// it - plus what the provider calls the whole thing.
// `latitude`/`longitude` are genuinely new data - no table holds them, and
// they exist so the FORM'S MAP can centre on what the server resolved. Without
// them the browser had to geocode the same address a second time through the
// Maps JS SDK, which is a second billed Google surface and a second key in a
// page.
export const PlaceLookup = AddressPatch.extend({
  formatted_address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export type PlaceLookup = z.infer<typeof PlaceLookup>;
