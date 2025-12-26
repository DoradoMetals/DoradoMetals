import pool from "#db";

export async function getAllSuppliers() {
  const query = `
    SELECT *
    FROM exchange.suppliers
  `;
  const values = [];
  const result = await pool.query(query, values);
  return result.rows;
}

export async function getSupplierFromId(id) {
  const query = `
    SELECT *
    FROM exchange.suppliers
    WHERE id = $1
  `;
  const values = [id];
  const result = await pool.query(query, values);
  return result.rows[0];
}
