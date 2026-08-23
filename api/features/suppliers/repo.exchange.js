// Suppliers read from the exchange schema, which currently serves traffic.
//
// The shape is the NEW one, not exchange's. A supplier is two things in the new
// design - a refiner, and the organization it is - and the response says so
// rather than smearing the organization's fields across the top level. exchange
// holds them in one flat row, so this composes the nested shape out of it; the
// new schema holds them in two rows and joins them back. Both produce the same
// thing, which is what lets diff compare them.
//
// features/suppliers/wire.js flattens it back for the frontend, behind
// SUPPLIERS_WIRE, and that is a transformation rather than a rename - which is
// why this feature does not use shared/wire/rename.js.
import query from "#shared/db/query.js";

const FIELDS = `
  id, logo, created_at, updated_at,
  jsonb_build_object(
    'name', name,
    'email', email,
    'phone', phone,
    'enabled', is_active
  ) AS organization
`;

export async function getAllSuppliers(executor) {
  const sql = `SELECT ${FIELDS} FROM exchange.suppliers ORDER BY name ASC, id ASC`;
  const result = await query(sql, [], executor);
  return result.rows;
}

export async function getSupplierFromId(id, executor) {
  const sql = `SELECT ${FIELDS} FROM exchange.suppliers WHERE id = $1`;
  const result = await query(sql, [id], executor);
  return result.rows[0];
}
