// A supplier is a refiner and the organization it is, and the new shape keeps
// them apart. The frontend still expects one flat object with the
// organization's fields at the top level and `is_active` rather than `enabled`.
//
//   REFINERS_WIRE=legacy  (default) flat, is_active
//   REFINERS_WIRE=next              nested organization, enabled
//
// Flattening loses which fields belong to the organization - that is the whole
// point of the legacy shape and the reason it is being left behind.
//
// This used to be forty-seven hand-written lines, identical to
// features/shipping/carriers/wire.ts character for character apart from the
// environment variable, and the same again as features/addresses/wire.ts with
// different nouns. shared/wire/lift.ts is that behaviour extracted; the helper
// was proved equivalent to all three on nulls, partials, missing keys,
// already-nested rows and lists before any of them was replaced.
import { makeLiftAdapter } from "#shared/wire/lift.ts";

export const { toWire, fromWire, toLegacy, fromLegacy, activeShape } = makeLiftAdapter({
  env: "REFINERS_WIRE",
  key: "organization",
  // NESTED field name to the FLAT name it is lifted to.
  fields: { name: "name", email: "email", phone: "phone", enabled: "is_active" },
});
