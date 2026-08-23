// Builds a wire adapter for a feature whose legacy shape differs only by names.
//
// Two switches govern a migrated feature and they answer different questions:
//
//   *_SOURCE   which schema the data is read from   (exchange | dual)
//   *_WIRE     which shape it leaves the API in     (legacy  | next)
//
// A feature can be on `dual` and `legacy`, or `exchange` and `next`. The first
// is flipped when the data is ready, the second when the frontend is.
//
// The direction is the part that matters. Repos return the NEW shape - that is
// the internal truth - and the adapter converts DOWN to legacy on the way out
// and back UP on the way in. Doing it the other way round makes the legacy shape
// the internal truth and leaves nothing to delete at the end; this way the
// adapter is a shim with an expiry date, exactly like repo.exchange.
//
// THIS HELPER ONLY COVERS RENAMES. Some features do not differ by names but by
// SHAPE: a purchase order is created today from one blob the API fans out into
// an order, a shipment and its items, and in the new flow that has to become a
// checkout session first and be converted from there. That is a translation
// between two creation flows, not a field map, and those features write their
// own adapter rather than calling this. This exists so the simple cases are one
// declaration and the hard ones are obviously not.
//
// Rename only means reversible by reading it backwards, and that is asserted:
// every field not being renamed must come through untouched.

function invert(map) {
  return Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
}

function rename(row, names) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) out[names[key] ?? key] = value;
  return out;
}

const overList = (fn) => (data) => (Array.isArray(data) ? data.map(fn) : fn(data));

// `names` maps the NEW name to the LEGACY one, in that direction, because the
// new shape is the one the code speaks.
export function makeWireAdapter({ env, names }) {
  const toLegacy = (row) => rename(row, names);
  const fromLegacy = (row) => rename(row, invert(names));
  const identity = (row) => row;

  const SHAPES = { legacy: toLegacy, next: identity };
  const SHAPE = Object.hasOwn(SHAPES, process.env[env] ?? "") ? process.env[env] : "legacy";

  return {
    activeShape: SHAPE,
    // Applied at the edge to whatever is about to be sent.
    toWire: overList(SHAPES[SHAPE]),
    // Applied at the edge to what arrived. Always converts, whatever the switch
    // says: a request in the new shape is unchanged by it, because the legacy
    // names are not present to rename.
    fromWire: overList(fromLegacy),
    // For the contract check, which parses both shapes regardless of the switch.
    toLegacy: overList(toLegacy),
    fromLegacy: overList(fromLegacy),
  };
}
