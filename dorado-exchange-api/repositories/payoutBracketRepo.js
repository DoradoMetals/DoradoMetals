import pool from "../db.js";

export async function getPayoutBrackets() {
  const query = `
    SELECT
      pb.id,
      m.type AS metal,
      pb.material,
      pb.min_qty,
      pb.max_qty,
      pb.payout_pct,
      pb.effective_from,
      pb.effective_to
    FROM exchange.payout_brackets pb
    JOIN exchange.metals m ON m.id = pb.metal_id
    WHERE pb.effective_to IS NULL OR pb.effective_to > now()
    ORDER BY m.type, pb.material, pb.min_qty;
  `;

  const result = await pool.query(query, []);
  return result.rows;
}
