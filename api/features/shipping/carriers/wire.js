// A carrier is a shipping.carriers row and the organization it is, and the new
// shape keeps them apart. The frontend still expects one flat object with the
// organization's fields at the top level and `is_active` rather than `enabled`.
//
//   CARRIERS_WIRE=legacy  (default) flat, is_active
//   CARRIERS_WIRE=next              nested organization, enabled
//
// A transformation rather than a rename, so it does not use
// shared/wire/rename.js - the same shape as features/suppliers/wire.js, because
// a carrier and a refiner are the same kind of thing in the new design: an
// organization with a role.
const overList = (fn) => (data) => (Array.isArray(data) ? data.map(fn) : fn(data));

function flatten(row) {
  if (!row || typeof row !== "object") return row;
  const { organization, ...rest } = row;
  const org = organization ?? {};
  return {
    ...rest,
    name: org.name ?? null,
    email: org.email ?? null,
    phone: org.phone ?? null,
    is_active: org.enabled ?? null,
  };
}

function nest(row) {
  if (!row || typeof row !== "object") return row;
  if (row.organization) return row;
  const { name, email, phone, is_active, ...rest } = row;
  if (name === undefined && email === undefined && phone === undefined && is_active === undefined) {
    return row;
  }
  return { ...rest, organization: { name, email, phone, enabled: is_active } };
}

const identity = (row) => row;
const SHAPES = { legacy: flatten, next: identity };
const SHAPE = Object.hasOwn(SHAPES, process.env.CARRIERS_WIRE ?? "")
  ? process.env.CARRIERS_WIRE
  : "legacy";

export const activeShape = SHAPE;
export const toWire = overList(SHAPES[SHAPE]);
export const fromWire = overList(nest);
export const toLegacy = overList(flatten);
export const fromLegacy = overList(nest);
