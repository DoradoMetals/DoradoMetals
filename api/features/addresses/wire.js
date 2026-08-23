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
// shared/wire/rename.js.
const overList = (fn) => (data) => (Array.isArray(data) ? data.map(fn) : fn(data));

function flatten(row) {
  if (!row || typeof row !== "object") return row;
  const { user_address, ...rest } = row;
  const link = user_address ?? {};
  return {
    ...rest,
    user_id: link.user_id ?? null,
    name: link.label ?? null,
    is_default: link.default_shipping ?? null,
  };
}

function nest(row) {
  if (!row || typeof row !== "object") return row;
  if (row.user_address) return row;
  const { user_id, name, is_default, ...rest } = row;
  if (user_id === undefined && name === undefined && is_default === undefined) return row;
  return { ...rest, user_address: { user_id, label: name, default_shipping: is_default } };
}

const identity = (row) => row;
const SHAPES = { legacy: flatten, next: identity };
const SHAPE = Object.hasOwn(SHAPES, process.env.ADDRESSES_WIRE ?? "")
  ? process.env.ADDRESSES_WIRE
  : "legacy";

export const activeShape = SHAPE;
export const toWire = overList(SHAPES[SHAPE]);
export const fromWire = overList(nest);
export const toLegacy = overList(flatten);
export const fromLegacy = overList(nest);
