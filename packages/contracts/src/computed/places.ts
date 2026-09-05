import { z } from "zod/v4";
import { Address, AddressPatch } from "../places/addresses.js";
import { UserAddressRead } from "../places/user_addresses.js";

export const AddressBookActions = z.object({
  edit: z.boolean(),
  remove: z.boolean(),
  set_default: z.boolean(),
});
export type AddressBookActions = z.infer<typeof AddressBookActions>;

export const AddressBookEntryFacts = z.object({
  address: Address,
  user_address: UserAddressRead,
  locked: z.boolean(),
});
export type AddressBookEntryFacts = z.infer<typeof AddressBookEntryFacts>;

export const AddressBookEntry = AddressBookEntryFacts.extend({
  actions: AddressBookActions,
});
export type AddressBookEntry = z.infer<typeof AddressBookEntry>;

export const PlaceSuggestion = z.object({
  place_id: z.string(),
  main: z.string(),
  secondary: z.string().nullable(),
});
export type PlaceSuggestion = z.infer<typeof PlaceSuggestion>;

export const PlaceLookup = AddressPatch.extend({
  formatted_address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export type PlaceLookup = z.infer<typeof PlaceLookup>;
