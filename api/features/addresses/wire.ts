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
// A transformation rather than a rename, so it does not use
// shared/wire/rename.ts.
import type { WireRow, WireData } from "#shared/wire/rename.ts";

// The types are wide on purpose, for the same reason shared/wire/rename.ts
// gives: this runs at the edge on a response body whose shape it has never
// been told, and its contract is that fields it does not touch pass through
// untouched - including ones nobody has declared. A type naming specific
// fields would claim the adapter had checked for them.
//
// What IS worth typing is the nested object being lifted, because that is the
// part this file knows about and the part a wire flip changes.

/** What places.user_addresses contributes to a flattened address. */
interface UserAddressLink {
  user_id?: unknown;
  label?: unknown;
  default_shipping?: unknown;
}

type RowFn = (row: WireRow | null | undefined) => WireRow | null | undefined;

const overList =
  (fn: RowFn) =>
  (data: WireData): WireData =>
    Array.isArray(data) ? (data.map(fn) as WireRow[]) : (fn(data) as WireRow);

function flatten(row: WireRow | null | undefined): WireRow | null | undefined {
  if (!row || typeof row !== "object") return row;
  const { user_address, ...rest } = row;
  const link = (user_address ?? {}) as UserAddressLink;
  return {
    ...rest,
    user_id: link.user_id ?? null,
    name: link.label ?? null,
    is_default: link.default_shipping ?? null,
  };
}

function nest(row: WireRow | null | undefined): WireRow | null | undefined {
  if (!row || typeof row !== "object") return row;
  if (row.user_address) return row;
  const { user_id, name, is_default, ...rest } = row;
  if (user_id === undefined && name === undefined && is_default === undefined) return row;
  return { ...rest, user_address: { user_id, label: name, default_shipping: is_default } };
}

const identity: RowFn = (row) => row;
const SHAPES: Record<string, RowFn> = { legacy: flatten, next: identity };
const SHAPE = Object.hasOwn(SHAPES, process.env.ADDRESSES_WIRE ?? "")
  ? (process.env.ADDRESSES_WIRE as string)
  : "legacy";

export const activeShape = SHAPE;
export const toWire = overList(SHAPES[SHAPE]);
export const fromWire = overList(nest);
export const toLegacy = overList(flatten);
export const fromLegacy = overList(nest);
