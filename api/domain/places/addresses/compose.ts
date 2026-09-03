// A postal address and one person's relationship to it, joined in memory.
//
// The implementation this replaces did it in SQL - `JOIN places.user_addresses
// ua ON ua.address_id = a.id` with jsonb_build_object - and it must produce
// exactly what that produced, because wire.ts flattens this back for
// ADDRESSES_WIRE=legacy and the frontend reads the flat shape.
//
// AN INNER JOIN DROPPED AN ADDRESS WITH NO LINK, and so does this. That is
// deliberate and load-bearing: an address with no user_addresses row is a
// snapshot taken for an order, not something in anyone's book, and exchange's
// list would never have returned it.
import type { AddressRow } from "#db/places/addresses/repo.ts";
import type { UserAddressRow } from "#db/places/user-addresses/repo.ts";

// default_billing is deliberately absent. exchange has no second flag and the
// projection it replaces did not return one, so putting it on the wire would be
// a wire change.
export type ComposedAddress = AddressRow & {
  user_address: Pick<UserAddressRow, "user_id" | "label" | "default_shipping">;
};

export const compose = (a: AddressRow, ua: UserAddressRow): ComposedAddress => ({
  ...a,
  user_address: {
    user_id: ua.user_id,
    label: ua.label,
    default_shipping: ua.default_shipping,
  },
});

// ORDER BY ua.default_shipping DESC, a.id ASC - it sorted on a column of the
// joined table, so the ordering moves here where both halves exist. DESC on a
// boolean puts true first.
export const byDefaultThenId = (a: ComposedAddress, b: ComposedAddress): number =>
  Number(b.user_address.default_shipping) - Number(a.user_address.default_shipping) ||
  a.id.localeCompare(b.id);

// Links first, then the addresses they point at - one read each rather than a
// join, and rows whose address has gone are dropped rather than composed with
// undefined.
export function all(links: UserAddressRow[], addresses: AddressRow[]): ComposedAddress[] {
  const byId = new Map(addresses.map((a) => [a.id, a]));
  return links
    .flatMap((ua) => {
      const a = byId.get(ua.address_id);
      return a ? [compose(a, ua)] : [];
    })
    .sort(byDefaultThenId);
}
