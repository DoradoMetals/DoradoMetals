import pool from "../db.js";

export async function getRates() {
  const query = `
    SELECT
      r.id,
      m.type AS metal,
      r.material,
      r.min_qty,
      r.max_qty,
      r.payout_pct,
      r.effective_from,
      r.effective_to
    FROM exchange.rates r
    JOIN exchange.metals m ON m.id = r.metal_id
    WHERE r.effective_to IS NULL OR r.effective_to > now()
    ORDER BY m.type, r.material, r.min_qty;
  `;

  const result = await pool.query(query, []);
  return result.rows;
}
