import pool from "#db";

export async function getAll() {
  const query = `
  SELECT *
  FROM exchange.carriers
  `;
  const result = await pool.query(query, []);
  return result.rows;
}
