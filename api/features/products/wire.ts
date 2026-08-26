// The shape a product goes out on, as against the shape it is stored in.
//
//   PRODUCTS_WIRE=legacy  (default) product_name / product_description / product_type
//   PRODUCTS_WIRE=next             name / description / type
//
// This is a different axis from PRODUCTS_SOURCE and the two must not be
// conflated. SOURCE decides which schema the data is read from; WIRE decides
// which shape it leaves the API in. A feature can be on `dual` and `legacy`, or
// `exchange` and `next` - they answer different questions and are flipped for
// different reasons, the first when the data is ready and the second when the
// frontend is.
//
// The direction matters. Both repos now return the NEW shape - repo.exchange
// aliases exchange's product_name up to name, repo.next returns it natively -
// and this converts DOWN to legacy on the way out. Doing it the other way round,
// with repos returning legacy and something converting up, would make the legacy
// shape the internal truth and there would be nothing to delete at the end. This
// way the adapter is a shim with an expiry date: when the frontend reads `name`,
// PRODUCTS_WIRE flips to next and this file goes.
//
// Rename only. Nothing is computed, dropped or added, so it is reversible by
// reading it backwards.
//
// THIS WAS FIFTY LINES OF ITS OWN RENAME MACHINERY. It predates
// shared/wire/rename.ts and reimplemented it exactly - the same key loop, the
// same inverted map, the same SHAPES lookup, the same overList. Two copies of
// one behaviour is the condition for them to drift apart, and this one had
// already grown a stray blank comment where an export used to be.
//
// The helper's own header says the simple cases should be one declaration and
// the hard ones should be obviously not. This is a simple case. Equivalence was
// not assumed: validate:wire parses real responses through the contract in BOTH
// shapes, and products is one of the endpoints it covers.
import { makeWireAdapter } from "#shared/wire/rename.ts";

export const { toWire, fromWire, toLegacy, fromLegacy, activeShape } = makeWireAdapter({
  env: "PRODUCTS_WIRE",
  // NEW name to LEGACY name, in that direction, because the new shape is the
  // one the code speaks.
  names: {
    name: "product_name",
    description: "product_description",
    type: "product_type",
  },
});
