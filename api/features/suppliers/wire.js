// A supplier is a refiner and the organization it is, and the new shape keeps
// them apart. The frontend still expects one flat object with the
// organization's fields at the top level and `is_active` rather than `enabled`.
//
//   SUPPLIERS_WIRE=legacy  (default) flat, is_active
//   SUPPLIERS_WIRE=next              nested organization, enabled
//
// This is a transformation, not a rename, so it does not use
// shared/wire/rename.js. Flattening loses which fields belong to the
// organization - that is the whole point of the legacy shape and the reason it
// is being left behind.
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

// The inverse: a request in the flat shape becomes the nested one. Applied
// whatever the switch says, because a request already nested has no top-level
// name to lift.
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
const SHAPE = Object.hasOwn(SHAPES, process.env.SUPPLIERS_WIRE ?? "")
  ? process.env.SUPPLIERS_WIRE
  : "legacy";

export const activeShape = SHAPE;
export const toWire = overList(SHAPES[SHAPE]);
export const fromWire = overList(nest);
export const toLegacy = overList(flatten);
export const fromLegacy = overList(nest);
