// Rates read from rates.rates. Differs from repo.exchange.js only in the tables
// it names and in metals.metals calling its label column `name` where
// exchange.metals calls it `type` - aliased so the wire shape is unchanged.
import query from "#shared/db/query.js";

export async function getRate(id, executor) {
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
    FROM rates.rates r
    JOIN metals.metals m ON m.id = r.metal_id
    WHERE r.id = $1
  `;
  const { rows } = await query(sql, [id]);
  return rows[0];
}

export async function getAllRates(executor) {
  const sql = `
    SELECT
      r.id,
      m.name AS metal,
      r.unit,
      r.min_qty,
      r.max_qty,
      r.scrap_pct,
      r.bullion_pct
    FROM rates.rates r
    JOIN metals.metals m ON m.id = r.metal_id
    ORDER BY m.name, r.min_qty, r.id
  `;
  const { rows } = await query(sql, [], executor);
  return rows;
}

export async function getAdminRates(executor) {
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
    FROM rates.rates r
    JOIN metals.metals m ON m.id = r.metal_id
    ORDER BY m.name, r.min_qty, r.id
  `;
  const { rows } = await query(sql, [], executor);
  return rows;
}

export async function createRate(rate, user_name = "Dorado Admin", executor) {
  const sql = `
    INSERT INTO rates.rates
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
  const { rows } = await query(sql, values, executor);
  return rows[0];
}

export async function updateRate(rate, user_name, executor) {
  const sql = `
    UPDATE rates.rates
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
  const { rows } = await query(sql, values, executor);
  return rows[0];
}

export async function deleteRate(id, executor) {
  await query(`DELETE FROM rates.rates WHERE id = $1`, [id]);
  return { success: true };
}

// Copies a rate from exchange.rates, id included, creating or overwriting.
//
// Server-side, for the same reason as the other mirrors: a row read into
// JavaScript comes back with millisecond timestamps and would silently lose the
// microseconds Postgres stores.
export async function mirrorRate(id, executor) {
  const cols = `id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct, created_at, updated_at, created_by, updated_by`;
  const sql = `
    INSERT INTO rates.rates (${cols})
    SELECT ${cols} FROM exchange.rates WHERE id = $1
    ON CONFLICT (id) DO UPDATE SET
      metal_id = EXCLUDED.metal_id, unit = EXCLUDED.unit,
      min_qty = EXCLUDED.min_qty, max_qty = EXCLUDED.max_qty,
      scrap_pct = EXCLUDED.scrap_pct, bullion_pct = EXCLUDED.bullion_pct,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
      created_by = EXCLUDED.created_by, updated_by = EXCLUDED.updated_by
    RETURNING ${cols};
  `;
  const { rows } = await query(sql, [id], executor);
  return rows[0];
}
