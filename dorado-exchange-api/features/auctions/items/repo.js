import pool from "#db";
import query from "#shared/db/query.js"; // adjust path to wherever you put it

export async function listByAuction(auction_id, client) {
  const q = `
    SELECT
      ai.*,
      to_jsonb(p) ||
      jsonb_build_object(
        'mint_name', mi.name,
        'metal_type', me.type
      ) AS bullion
    FROM exchange.auction_items ai
    JOIN exchange.products p ON p.id = ai.bullion_id
    JOIN exchange.metals me ON me.id = p.metal_id
    JOIN exchange.mints  mi ON mi.id = p.mint_id
    WHERE ai.auction_id = $1
    ORDER BY ai.number ASC;
  `;
  const { rows } = await query(q, [auction_id], client);
  return rows;
}

export async function getAll(client) {
  const q = `
    SELECT
      ai.*,
      to_jsonb(p) ||
      jsonb_build_object(
        'mint_name', mi.name,
        'metal_type', me.type
      ) AS bullion
    FROM exchange.auction_items ai
    JOIN exchange.products p ON p.id = ai.bullion_id
    JOIN exchange.metals me ON me.id = p.metal_id
    JOIN exchange.mints  mi ON mi.id = p.mint_id
    ORDER BY ai.number ASC;
  `;
  const { rows } = await query(q, [], client);
  return rows;
}

export async function getById(item_id, client) {
  const q = `
    SELECT
      ai.*,
      to_jsonb(p) ||
      jsonb_build_object(
        'mint_name', mi.name,
        'metal_type', me.type
      ) AS bullion
    FROM exchange.auction_items ai
    JOIN exchange.products p ON p.id = ai.bullion_id
    JOIN exchange.metals me ON me.id = p.metal_id
    JOIN exchange.mints  mi ON mi.id = p.mint_id
    WHERE ai.id = $1;
  `;
  const { rows } = await query(q, [item_id], client);
  return rows[0] || null;
}

export async function create(
  {
    auction_id,
    bullion_id,
    buyer_email,
    buyer_name,
    sold,
    starting_bid,
    ending_bid,
    quantity,
    number,
  },
  client
) {
  const q = `
    WITH ins AS (
      INSERT INTO exchange.auction_items (
        auction_id, bullion_id,
        buyer_email, buyer_name, sold,
        starting_bid, ending_bid, quantity,
        number
      )
      VALUES ($1,$2,$3,$4,COALESCE($5,false),$6,$7,$8,$9)
      RETURNING *
    )
    SELECT
      ins.*,
      to_jsonb(p) ||
      jsonb_build_object(
        'mint_name', mi.name,
        'metal_type', me.type
      ) AS bullion
    FROM ins
    JOIN exchange.products p ON p.id = ins.bullion_id
    JOIN exchange.metals me ON me.id = p.metal_id
    JOIN exchange.mints  mi ON mi.id = p.mint_id;
  `;

  const values = [
    auction_id,
    bullion_id,
    buyer_email ?? null,
    buyer_name ?? null,
    sold ?? null,
    starting_bid ?? null,
    ending_bid ?? null,
    quantity ?? null,
    number ?? null,
  ];

  const { rows } = await query(q, values, client);
  return rows[0];
}

export async function update({ item_id, patch }, client) {
  const q = `
    WITH upd AS (
      UPDATE exchange.auction_items
      SET
        buyer_email  = COALESCE($2, buyer_email),
        buyer_name   = COALESCE($3, buyer_name),
        sold         = COALESCE($4, sold),
        starting_bid = COALESCE($5, starting_bid),
        ending_bid   = COALESCE($6, ending_bid),
        quantity     = COALESCE($7, quantity)
      WHERE id = $1
      RETURNING *
    )
    SELECT
      upd.*,
      to_jsonb(p) ||
      jsonb_build_object(
        'mint_name', mi.name,
        'metal_type', me.type
      ) AS bullion
    FROM upd
    JOIN exchange.products p ON p.id = upd.bullion_id
    JOIN exchange.metals me ON me.id = p.metal_id
    JOIN exchange.mints  mi ON mi.id = p.mint_id;
  `;

  const values = [
    item_id,
    patch.buyer_email ?? null,
    patch.buyer_name ?? null,
    patch.sold ?? null,
    patch.starting_bid ?? null,
    patch.ending_bid ?? null,
    patch.quantity ?? null,
  ];

  const { rows } = await query(q, values, client);
  return rows[0] || null;
}

export async function remove(item_id, client) {
  const q = `
    DELETE FROM exchange.auction_items
    WHERE id = $1;
  `;
  const res = await query(q, [item_id], client);
  return res.rowCount > 0;
}

export async function createLots(
  { auction_id, bullion_id, quantity_per_lot, lot_count, starting_bid },
  client
) {
  const lotCount = Number.isFinite(Number(lot_count)) ? Number(lot_count) : 0;
  if (lotCount <= 0) return [];

  const q = `
    WITH base AS (
      SELECT COALESCE(MAX(number), 0) AS max_number
      FROM exchange.auction_items
      WHERE auction_id = $1
    ),
    ins AS (
      INSERT INTO exchange.auction_items (
        auction_id,
        bullion_id,
        quantity,
        starting_bid,
        sold,
        number
      )
      SELECT
        $1,
        $2,
        $3::int,
        $4::numeric,
        false,
        base.max_number + gs.i
      FROM base
      CROSS JOIN generate_series(1, $5::int) AS gs(i)
      RETURNING *
    )
    SELECT
      ins.*,
      to_jsonb(p) ||
      jsonb_build_object(
        'mint_name', mi.name,
        'metal_type', me.type
      ) AS bullion
    FROM ins
    JOIN exchange.products p ON p.id = ins.bullion_id
    JOIN exchange.metals me ON me.id = p.metal_id
    JOIN exchange.mints  mi ON mi.id = p.mint_id
    ORDER BY ins.number ASC;
  `;

  const values = [
    auction_id,
    bullion_id,
    quantity_per_lot ?? null,
    starting_bid ?? null,
    lotCount,
  ];

  const { rows } = await query(q, values, client);
  return rows;
}


export async function lockByAuction(auction_id, client) {
  const q = `
    SELECT id
    FROM exchange.auction_items
    WHERE auction_id = $1
    FOR UPDATE
  `;
  await query(q, [auction_id], client);
  return true;
}

export async function removeMany({ auction_id, item_ids }, client) {
  if (!Array.isArray(item_ids) || item_ids.length === 0) return 0;

  const q = `
    DELETE FROM exchange.auction_items
    WHERE auction_id = $1
      AND id = ANY($2::uuid[]);
  `;

  return await query(q, [auction_id, item_ids], client);
}


export async function reorderByAuction(auction_id, client) {
  const q = `
    WITH ranked AS (
      SELECT
        id,
        row_number() OVER (ORDER BY number ASC, id ASC)::int AS new_number
      FROM exchange.auction_items
      WHERE auction_id = $1
    )
    UPDATE exchange.auction_items ai
    SET number = r.new_number
    FROM ranked r
    WHERE ai.id = r.id
      AND ai.auction_id = $1;
  `;

  return await query(q, [auction_id], client);
}
