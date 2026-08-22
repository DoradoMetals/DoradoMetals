// Suppliers read from the exchange schema, which currently serves traffic.
//
// Projected explicitly rather than SELECT *, matching repo.next.js so the two
// return the same shape.
import query from "#shared/db/query.js";

const FIELDS = `id, name, email, phone, created_at, updated_at, logo, is_active`;

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
