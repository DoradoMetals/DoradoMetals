// A postal address and a person's relationship to it are different things.
//
// exchange keeps both in one row - name and is_default sit on the address - and
// the new schema splits them: places.addresses holds the address, and
// places.user_addresses holds what one person calls it and whether it is their
// default. That split is why an order can snapshot an address without copying
// whose it was.
//
// The frontend still expects one flat object with `name` and `is_default` at the
// top level, so the adapter flattens.
//
//   ADDRESSES_WIRE=legacy  (default) flat, name / is_default / user_id
//   ADDRESSES_WIRE=next              nested user_address
//
// The same lift as refiners and carriers with different nouns, which is what
// shared/wire/lift.ts exists to say once. Note is_default maps to
// default_shipping only: the new schema splits it into a shipping default and a
// billing default, because those are not the same fact, and the legacy shape
// can only carry one of them.
import { makeLiftAdapter } from "#shared/wire/lift.ts";

export const { toWire, fromWire, toLegacy, fromLegacy, activeShape } = makeLiftAdapter({
  env: "ADDRESSES_WIRE",
  key: "user_address",
  // NESTED field name to the FLAT name it is lifted to.
  fields: { user_id: "user_id", label: "name", default_shipping: "is_default" },
});
