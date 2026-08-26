// Builds a wire adapter for a feature whose legacy shape FLATTENS a nested
// object into the top level.
//
// shared/wire/rename.ts covers the features that differ only by field names.
// This covers the next case up: the new schema keeps a thing and its
// relationship to something else in separate objects, and the legacy shape
// knows only one flat row.
//
//   refiners   organization      name / email / phone / enabled -> is_active
//   carriers   organization      the same, because a carrier and a refiner are
//                                the same kind of thing in the new design: an
//                                organization with a role
//   addresses  user_address      user_id / label -> name / default_shipping ->
//                                is_default
//
// WHY THIS EXISTS. Those three files were the same forty-seven lines three
// times over. carriers and refiners were identical character for character
// apart from the environment variable, and carriers said so in its own header -
// "the same shape as features/refiners/wire.ts". addresses was the same
// again with different nouns. Three copies of one behaviour is three places for
// it to drift, and the flattening is not trivial: it defaults missing fields to
// null, and getting that wrong turns a missing organization into a crash rather
// than a row of nulls.
//
// FLATTENING IS LOSSY AND THAT IS THE POINT. Which fields belonged to the
// organization is exactly what the legacy shape does not record, and why it is
// being left behind. Reading it backwards recovers the nesting only because the
// field list is declared here.
//
// The types are wide for the same reason rename.ts gives: this runs at the edge
// on rows whose shape it has never been told, and its contract is that fields
// it does not touch pass through untouched.
import type { WireRow, WireData } from "#shared/wire/rename.ts";

/** Maps the NESTED field name to the FLAT one it is lifted to. */
export type LiftMap = Record<string, string>;

type RowFn = (row: WireRow | null | undefined) => WireRow | null | undefined;

const overList =
  (fn: RowFn) =>
  (data: WireData): WireData =>
    Array.isArray(data) ? (data.map(fn) as WireRow[]) : (fn(data) as WireRow);

export interface LiftAdapter {
  activeShape: string;
  toWire: (data: WireData) => WireData;
  fromWire: (data: WireData) => WireData;
  toLegacy: (data: WireData) => WireData;
  fromLegacy: (data: WireData) => WireData;
}

export function makeLiftAdapter({
  env,
  key,
  fields,
}: {
  /** The environment variable holding legacy | next. */
  env: string;
  /** The property holding the nested object, e.g. "organization". */
  key: string;
  /** Nested field name to flat field name. */
  fields: LiftMap;
}): LiftAdapter {
  const flatten: RowFn = (row) => {
    if (!row || typeof row !== "object") return row;
    const { [key]: nested, ...rest } = row;
    const inner = (nested ?? {}) as Record<string, unknown>;
    const lifted: WireRow = { ...rest };
    // `?? null` rather than leaving it absent: the legacy shape always carried
    // these keys, and a frontend destructuring them wants null, not undefined.
    for (const [from, to] of Object.entries(fields)) lifted[to] = inner[from] ?? null;
    return lifted;
  };

  const nest: RowFn = (row) => {
    if (!row || typeof row !== "object") return row;
    // Already nested - a request in the new shape passes straight through.
    if (row[key]) return row;

    const flatNames = Object.values(fields);
    // None of the flat fields is present, so there is nothing to lift and this
    // is not a legacy body. Returning the row untouched rather than attaching an
    // object of undefineds, which would look like a deliberate blanking.
    if (flatNames.every((name) => row[name] === undefined)) return row;

    const rest: WireRow = { ...row };
    const inner: WireRow = {};
    for (const [to, from] of Object.entries(fields)) {
      inner[to] = row[from];
      delete rest[from];
    }
    return { ...rest, [key]: inner };
  };

  const identity: RowFn = (r) => r;
  const SHAPES: Record<string, RowFn> = { legacy: flatten, next: identity };
  const SHAPE = Object.hasOwn(SHAPES, process.env[env] ?? "")
    ? (process.env[env] as string)
    : "legacy";

  return {
    activeShape: SHAPE,
    toWire: overList(SHAPES[SHAPE]),
    fromWire: overList(nest),
    toLegacy: overList(flatten),
    fromLegacy: overList(nest),
  };
}
