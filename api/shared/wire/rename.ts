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
//
// WHY THE TYPES ARE DELIBERATELY WIDE.
//
// A rename is dynamic key-mapping: which keys come out depends on a map read at
// runtime. TypeScript can be made to express that with mapped types, and the
// result would claim more than this function knows - the rows arriving here are
// whatever a repo returned, and the adapter is applied at the edge to a response
// body it has never seen the shape of.
//
// So a row is `Record<string, unknown>` and stays one. That is not a gap to fill
// in later with something tighter; a type that named specific fields would be
// asserting the adapter had checked for them, which it does not and must not -
// its whole contract is that fields it does not rename pass through untouched,
// including ones nobody has declared.

/** A single row on its way in or out. Field types are unknown by construction. */
export type WireRow = Record<string, unknown>;

/** What the adapter is applied to: one row, a list of them, or nothing. */
export type WireData = WireRow | WireRow[] | null | undefined;

/** Maps the NEW name to the LEGACY one, in that direction. */
export type NameMap = Record<string, string>;

function invert(map: NameMap): NameMap {
  return Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
}

function rename(row: WireRow | null | undefined, names: NameMap): WireRow | null | undefined {
  if (!row || typeof row !== "object") return row;
  const out: WireRow = {};
  for (const [key, value] of Object.entries(row)) out[names[key] ?? key] = value;
  return out;
}

type RowFn = (row: WireRow | null | undefined) => WireRow | null | undefined;

const overList =
  (fn: RowFn) =>
  (data: WireData): WireData =>
    Array.isArray(data) ? (data.map(fn) as WireRow[]) : (fn(data) as WireRow);

export interface WireAdapter {
  /** "legacy" or "next", whichever the environment selected. */
  activeShape: string;
  /** Applied at the edge to whatever is about to be sent. */
  toWire: (data: WireData) => WireData;
  /** Applied at the edge to what arrived. */
  fromWire: (data: WireData) => WireData;
  /** For the contract check, which parses both shapes regardless of the switch. */
  toLegacy: (data: WireData) => WireData;
  fromLegacy: (data: WireData) => WireData;
}

export function makeWireAdapter({ env, names }: { env: string; names: NameMap }): WireAdapter {
  const toLegacy: RowFn = (row) => rename(row, names);
  const fromLegacy: RowFn = (row) => rename(row, invert(names));
  const identity: RowFn = (row) => row;

  const SHAPES: Record<string, RowFn> = { legacy: toLegacy, next: identity };
  const SHAPE = Object.hasOwn(SHAPES, process.env[env] ?? "")
    ? (process.env[env] as string)
    : "legacy";

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
