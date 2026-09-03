// A postal address and one person's relationship to it, joined in memory.
// An address with no user_addresses row is dropped deliberately: it's an order snapshot, not something in anyone's book.
import type { AddressRow } from "#db/places/addresses/repo.ts";
import type { UserAddressRow } from "#db/places/user-addresses/repo.ts";

// default_billing is deliberately absent - putting it on the wire would be a wire change.
export type ComposedAddress = AddressRow & {
  user_address: Pick<UserAddressRow, "user_id" | "label" | "default_shipping">;
};

export const compose = (a: AddressRow, ua: UserAddressRow): ComposedAddress => ({
  id: a.id,
  line_1: a.line_1,
  line_2: a.line_2,
  city: a.city,
  state: a.state,
  country: a.country,
  zip: a.zip,
  country_code: a.country_code,
  phone_number: a.phone_number,
  created_at: a.created_at,
  updated_at: a.updated_at,
  is_valid: a.is_valid,
  is_residential: a.is_residential,
  user_address: {
    user_id: ua.user_id,
    label: ua.label,
    default_shipping: ua.default_shipping,
  },
});

// default_shipping DESC, id ASC - DESC on a boolean puts true first.
export const byDefaultThenId = (a: ComposedAddress, b: ComposedAddress): number =>
  Number(b.user_address.default_shipping) - Number(a.user_address.default_shipping) ||
  a.id.localeCompare(b.id);

// Links first, then the addresses they point at - rows whose address has gone are dropped rather than composed with undefined.
export function all(links: UserAddressRow[], addresses: AddressRow[]): ComposedAddress[] {
  const byId = new Map(addresses.map((a) => [a.id, a]));
  return links
    .flatMap((ua) => {
      const a = byId.get(ua.address_id);
      return a ? [compose(a, ua)] : [];
    })
    .sort(byDefaultThenId);
}
