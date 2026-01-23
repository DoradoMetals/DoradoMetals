import pool from "#db";

export async function list() {
  const q = `
    SELECT *
    FROM exchange.auctions
    ORDER BY scheduled_date DESC NULLS LAST, created_at DESC;
  `;
  const { rows } = await pool.query(q);
  return rows;
}

export async function getById(auction_id) {
  const q = `
    SELECT *
    FROM exchange.auctions
    WHERE id = $1;
  `;
  const { rows } = await pool.query(q, [auction_id]);
  return rows[0] || null;
}

export async function create({ status, scheduled_date, user_id }) {
  const q = `
    INSERT INTO exchange.auctions (
      status, scheduled_date, created_by, updated_by
    )
    VALUES ($1, $2, $3, $3)
    RETURNING *;
  `;
  const { rows } = await pool.query(q, [
    status ?? "draft",
    scheduled_date ?? null,
    user_id ?? null,
  ]);
  return rows[0];
}

export async function update({ auction_id, status, scheduled_date, user_id }) {
  const q = `
    UPDATE exchange.auctions
    SET
      status = COALESCE($2, status),
      scheduled_date = COALESCE($3, scheduled_date),
      updated_by = $4,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const { rows } = await pool.query(q, [
    auction_id,
    status ?? null,
    scheduled_date ?? null,
    user_id ?? null,
  ]);
  return rows[0] || null;
}

export async function remove(auction_id) {
  const q = `
    DELETE FROM exchange.auctions
    WHERE id = $1;
  `;
  const res = await pool.query(q, [auction_id]);
  return res.rowCount > 0;
}


