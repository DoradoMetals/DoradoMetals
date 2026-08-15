// Rates read from core.rates. Differs from repo.exchange.js only in the tables
// it names and in core.metals calling its label column `name` where
// exchange.metals calls it `type` - aliased so the wire shape is unchanged.
import query from "#shared/db/query.js";

export async function getRate(id) {
  const sql = `
    SELECT
      r.id,
      r.metal_id,
      m.name AS metal,
      r.unit,
      r.min_qty,
      r.max_qty,
      r.scrap_pct,
      r.bullion_pct,
      r.created_at,
      r.updated_at,
      r.created_by,
      r.updated_by
    FROM core.rates r
    JOIN core.metals m ON m.id = r.metal_id
    WHERE r.id = $1
  `;
  const { rows } = await query(sql, [id]);
  return rows[0];
}

export async function getAllRates() {
  const sql = `
    SELECT
      r.id,
      m.name AS metal,
      r.unit,
      r.min_qty,
      r.max_qty,
      r.scrap_pct,
      r.bullion_pct
    FROM core.rates r
    JOIN core.metals m ON m.id = r.metal_id
    ORDER BY m.name, r.min_qty
  `;
  const { rows } = await query(sql, []);
  return rows;
}

export async function getAdminRates() {
  const sql = `
    SELECT
      r.id,
      r.metal_id,
      m.name AS metal,
      r.unit,
      r.min_qty,
      r.max_qty,
      r.scrap_pct,
      r.bullion_pct,
      r.created_at,
      r.updated_at,
      r.created_by,
      r.updated_by
    FROM core.rates r
    JOIN core.metals m ON m.id = r.metal_id
    ORDER BY m.name, r.min_qty
  `;
  const { rows } = await query(sql, []);
  return rows;
}

export async function createRate(rate, user_name = "Dorado Admin") {
  const sql = `
    INSERT INTO core.rates
      (id, metal_id, min_qty, max_qty, scrap_pct, bullion_pct, created_by, updated_by)
    VALUES
      (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $6)
    RETURNING *;
  `;
  const values = [
    rate.metal_id,
    rate.min_qty,
    rate.max_qty ?? null,
    rate.scrap_pct,
    rate.bullion_pct,
    user_name ?? "Dorado Admin",
  ];
  const { rows } = await query(sql, values);
  return rows[0];
}

export async function updateRate(rate, user_name) {
  const sql = `
    UPDATE core.rates
    SET
      min_qty = $1,
      max_qty = $2,
      scrap_pct = $3,
      bullion_pct = $4,
      updated_at = now(),
      updated_by = $5
    WHERE id = $6
    RETURNING *;
  `;
  const values = [
    rate.min_qty ?? 0,
    rate.max_qty ?? null,
    rate.scrap_pct ?? 0,
    rate.bullion_pct ?? 0,
    user_name ?? 'Dorado Admin',
    rate.id,
  ];
  const { rows } = await query(sql, values);
  return rows[0];
}

export async function deleteRate(id) {
  await query(`DELETE FROM core.rates WHERE id = $1`, [id]);
  return { success: true };
}
