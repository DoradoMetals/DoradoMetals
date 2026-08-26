// A supplier is a refiner and the organization it is, and the new shape keeps
// them apart. The frontend still expects one flat object with the
// organization's fields at the top level and `is_active` rather than `enabled`.
//
//   REFINERS_WIRE=legacy  (default) flat, is_active
//   REFINERS_WIRE=next              nested organization, enabled
//
// This is a transformation, not a rename, so it does not use
// shared/wire/rename.ts. Flattening loses which fields belong to the
// organization - that is the whole point of the legacy shape and the reason it
// is being left behind.
import type { WireRow, WireData } from "#shared/wire/rename.ts";

// The types are wide on purpose, for the same reason shared/wire/rename.ts
// gives: this runs at the edge on a response body whose shape it has never
// been told, and its contract is that fields it does not touch pass through
// untouched - including ones nobody has declared. A type naming specific
// fields would claim the adapter had checked for them.
//
// What IS worth typing is the nested object being lifted, because that is the
// part this file knows about and the part a wire flip changes.

/** What organizations contributes to a flattened refiner. */
interface OrganizationPart {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  enabled?: unknown;
}

type RowFn = (row: WireRow | null | undefined) => WireRow | null | undefined;

const overList =
  (fn: RowFn) =>
  (data: WireData): WireData =>
    Array.isArray(data) ? (data.map(fn) as WireRow[]) : (fn(data) as WireRow);

function flatten(row: WireRow | null | undefined): WireRow | null | undefined {
  if (!row || typeof row !== "object") return row;
  const { organization, ...rest } = row;
  const org = (organization ?? {}) as OrganizationPart;
  return {
    ...rest,
    name: org.name ?? null,
    email: org.email ?? null,
    phone: org.phone ?? null,
    is_active: org.enabled ?? null,
  };
}

// The inverse: a request in the flat shape becomes the nested one. Applied
// whatever the switch says, because a request already nested has no top-level
// name to lift.
function nest(row: WireRow | null | undefined): WireRow | null | undefined {
  if (!row || typeof row !== "object") return row;
  if (row.organization) return row;
  const { name, email, phone, is_active, ...rest } = row;
  if (name === undefined && email === undefined && phone === undefined && is_active === undefined) {
    return row;
  }
  return { ...rest, organization: { name, email, phone, enabled: is_active } };
}

const identity: RowFn = (row) => row;
const SHAPES: Record<string, RowFn> = { legacy: flatten, next: identity };
const SHAPE = Object.hasOwn(SHAPES, process.env.REFINERS_WIRE ?? "")
  ? (process.env.REFINERS_WIRE as string)
  : "legacy";

export const activeShape = SHAPE;
export const toWire = overList(SHAPES[SHAPE]);
export const fromWire = overList(nest);
export const toLegacy = overList(flatten);
export const fromLegacy = overList(nest);
