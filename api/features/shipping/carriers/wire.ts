// A carrier is a shipping.carriers row and the organization it is, and the new
// shape keeps them apart. The frontend still expects one flat object with the
// organization's fields at the top level and `is_active` rather than `enabled`.
//
//   CARRIERS_WIRE=legacy  (default) flat, is_active
//   CARRIERS_WIRE=next              nested organization, enabled
//
// The same declaration as features/refiners/wire.ts, and now visibly so: a
// carrier and a refiner are the same kind of thing in the new design, an
// organization with a role. This file said that in a comment while carrying its
// own copy of the code.
import { makeLiftAdapter } from "#shared/wire/lift.ts";

export const { toWire, fromWire, toLegacy, fromLegacy, activeShape } = makeLiftAdapter({
  env: "CARRIERS_WIRE",
  key: "organization",
  fields: { name: "name", email: "email", phone: "phone", enabled: "is_active" },
});
