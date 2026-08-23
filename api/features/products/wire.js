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
const LEGACY_NAMES = {
  name: "product_name",
  description: "product_description",
  type: "product_type",
};

function toLegacy_(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[LEGACY_NAMES[key] ?? key] = value;
  }
  return out;
}

const identity = (row) => row;

const SHAPES = { legacy: toLegacy_, next: identity };

const SHAPE = Object.hasOwn(SHAPES, process.env.PRODUCTS_WIRE ?? "")
  ? process.env.PRODUCTS_WIRE
  : "legacy";

export const activeShape = SHAPE;

// Applied at the edge, to whatever the controller is about to send: a row, a
// list of them, or null.
const overList = (fn) => (data) => (Array.isArray(data) ? data.map(fn) : fn(data));

// Named toWire/fromWire like every other adapter, so shared/wire/middleware.js
// can mount it without knowing which feature it belongs to.
export const toWire = overList(SHAPES[SHAPE]);
export const toLegacy = overList(toLegacy_);

// Exported for the contract check, which has to parse both shapes regardless of
// which one the switch currently selects - the same reason validate:wire tests
// repo.next even while the switch says exchange.


// The other direction: a request body still speaks the legacy names, and the
// repos now take the new ones. Applied at the edge, so both implementations see
// one shape and neither has to know the frontend has not caught up yet.
//
// Deleted at the same time as toLegacy, and for the same reason.
const NEW_NAMES = Object.fromEntries(
  Object.entries(LEGACY_NAMES).map(([next, legacy]) => [legacy, next])
);

function fromLegacy_(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[NEW_NAMES[key] ?? key] = value;
  }
  return out;
}

export const fromWire = overList(fromLegacy_);
export const fromLegacy = overList(fromLegacy_);
