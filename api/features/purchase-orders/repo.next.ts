// Purchase orders read from the orders schema.
//
// exchange keeps a purchase order in one wide row. Here it is four: the order,
// its offer, its money, and its lines. This reassembles the shape the API has
// always returned, so nothing downstream can tell the difference - which is the
// whole constraint, because the frontend is coupled to that shape.
//
// Reads only, for now. Every write still goes to exchange through
// repo.exchange.js, so there is nothing here that can lose a row.
//
// Two things worth knowing before reading the SQL.
//
// The address is a snapshot, but the id returned is the address-book id it was
// taken from, not the snapshot's. The frontend posts that id back at checkout
// and the API resolves it against exchange.addresses, so returning the snapshot
// id would break checkout. source_address_id exists for exactly this.
//
// Shipments, carrier pickups, payouts and users are still read from exchange.
// Those features have not been migrated; when they are, these joins move with
// them and nothing else here changes.
import query from "#shared/db/query.js";
import type { ComposedOrder } from "#features/purchase-orders/compose.ts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// The order row is ComposedOrder, the API's OWN assembled shape - see
// compose.ts. It was the PurchaseOrder contract until wave 3, when the wire
// slimmed to the orders.orders row plus totals and the composition stopped
// being a response. `diff` still compares this implementation against
// repo.exchange.js, which is what the shape is checked by.
export type PurchaseOrderRow = ComposedOrder;

// The per-metal spot row an order carries, from orders.spots or refiners.spots.
// No contract: it is never returned by a route on its own, only alongside an
// order.
//
// percent_change and dollar_change have NO column in the new schema and are
// projected as NULL to keep the shape. They are null on every row in exchange
// too, and nothing writes them - CLAUDE.md lists percent_change among the
// columns that are 100% NULL and still referenced by live code, which is
// exactly why they are projected rather than dropped.
export type OrderMetalRow = {
  id: string;
  purchase_order_id: string | null;
  name: string;
  ask: number | null;
  bid: number | null;
  percent_change: number | null;
  dollar_change: number | null;
  created_at: Date | null;
  updated_at: Date | null;
};

// A scrap line and what is needed to re-tier its premium. A line is scrap when
// it has no bullion, so there is no product to name.
export type OrderScrapItemRow = {
  id: string;
  metal: string;
  content: number | null;
};
// THE COMPOSED ORDER READS ARE GONE with the read pivot (ruling 8):
// read.service.ts is THE order read, assembled from the per-table repos.
// What remains here is the dual-write MIRROR machinery and the three
// internal reads the services still make against the new schema.


// The metal is a foreign key here and text in exchange, so it is joined back to
// its name. percent_change and dollar_change have no column by design - they
// are null on every row in exchange and nothing writes them - so they are
// projected as null to keep the shape.
export async function findMetalsByOrderId(orderId: string): Promise<OrderMetalRow[]> {
  const sql = `
    SELECT
      sp.id,
      sp.order_id AS purchase_order_id,
      m.name,
      sp.ask,
      sp.bid,
      NULL::numeric AS percent_change,
      NULL::numeric AS dollar_change,
      sp.created_at,
      sp.updated_at
    FROM orders.spots sp
    JOIN metals.metals m ON m.id = sp.metal_id
    WHERE sp.order_id = $1
    ORDER BY m.name ASC, sp.id ASC;
  `;
  const { rows } = await query<OrderMetalRow>(sql, [orderId]);
  return rows;
}


// The refiner's spot for an order.
//
// Same transformation as findMetalsByOrderId above - the metal is a foreign key
// here and text in exchange, and percent_change and dollar_change have no
// column by design, so they are projected as null to keep the shape.
//
// refiners.spots keeps its source id, unlike orders.spots which generates its
// own, because exchange.refiner_metals rows have nothing else to key on.
export async function findRefinerMetalsByOrderId(orderId: string): Promise<OrderMetalRow[]> {
  const sql = `
    SELECT
      sp.id,
      sp.order_id AS purchase_order_id,
      m.name,
      sp.ask,
      sp.bid,
      NULL::numeric AS percent_change,
      NULL::numeric AS dollar_change,
      sp.created_at,
      sp.updated_at
    FROM refiners.spots sp
    JOIN metals.metals m ON m.id = sp.metal_id
    WHERE sp.order_id = $1
    ORDER BY m.name ASC, sp.id ASC;
  `;
  const { rows } = await query<OrderMetalRow>(sql, [orderId]);
  return rows;
}

// Scrap lines on an order, with what is needed to re-tier their premiums.
export async function findOrderScrapItems(
  orderId: string,
  executor?: Executor
): Promise<OrderScrapItemRow[]> {
  const sql = `
    SELECT i.id, m.name AS metal, i.content
    FROM orders.items i
    JOIN metals.metals m ON m.id = i.metal_id
    WHERE i.order_id = $1 AND i.bullion_id IS NULL
  `;
  const { rows } = await query<OrderScrapItemRow>(sql, [orderId], executor);
  return rows;
}

// ---------------------------------------------------------------- mirroring
//
// The dual-write phase copies a purchase order across after exchange has been
// written to. Rather than a bespoke mirror per write - there are 38 of them,
// and each would be a chance to map a column wrong - the whole order is
// re-derived from exchange. The mirror is the same INSERT...SELECT the backfill
// uses, so there is one definition of what a purchase order looks like in the
// new schema, exercised on every write rather than only at migration time.
//
// Re-syncing the whole order costs more than updating one column and is worth
// it: a write that touches purchase_order_status alone still leaves the offer
// and the transaction correct, and no caller has to know which of the three
// tables its column landed in.
//
// Everything is server-side. Nothing round-trips through JS, because a JS Date
// truncates microseconds - the bug migration 015 had to undo.
//
// Every function takes the caller's executor so the mirror joins the same
// transaction as the write it follows. If it opened its own, a rolled-back
// write would leave a mirrored row behind, which is the exact divergence
// dual-write exists to prevent.

export async function mirrorOrder(orderId: string, executor?: Executor): Promise<void> {
  await query(
    `INSERT INTO orders.orders (
       id, user_id, direction, status, number, notes,
       review_created, order_sent, tracking_updated, spots_locked,
       created_by, updated_by, created_at, updated_at
     )
     SELECT
       p.id, p.user_id, 'purchase', p.purchase_order_status, p.order_number,
       p.notes, p.review_created, NULL, NULL, coalesce(p.spots_locked, false),
       p.created_by, p.updated_by,
       p.created_at AT TIME ZONE 'UTC', p.updated_at AT TIME ZONE 'UTC'
     FROM exchange.purchase_orders p
     WHERE p.id = $1
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id, status = EXCLUDED.status,
       spots_locked = EXCLUDED.spots_locked,
       number = EXCLUDED.number, notes = EXCLUDED.notes,
       review_created = EXCLUDED.review_created,
       created_by = EXCLUDED.created_by, updated_by = EXCLUDED.updated_by,
       created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    [orderId],
    executor
  );

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093's invariant). The mirror is
  // where a purchase order first exists in the new schema under dual, so the
  // engagement row is ensured here - values stay NULL until a refiner
  // reports, exactly the shape the 093 backfill chose. Idempotent: an order
  // that already has one is left alone, engagement values untouched.
  await query(
    `INSERT INTO refiners.orders (order_id)
     SELECT o.id FROM orders.orders o WHERE o.id = $1
     ON CONFLICT (order_id) DO NOTHING`,
    [orderId],
    executor
  );

  await query(
    `INSERT INTO orders.transactions (
       order_id, total, refiner_fee, waive_shipping_fee, waive_payout_fee,
       shipping_paid, shipping_fee_actual, pool_remediation, pool_oz_deducted,
       created_by, updated_by, created_at, updated_at
     )
     SELECT
       p.id, p.total_price, p.refiner_fee, p.waive_shipping_fee,
       p.waive_payout_fee, p.shipping_paid, p.shipping_fee_actual,
       p.pool_remediation, p.pool_oz_deducted, p.created_by, p.updated_by,
       p.created_at AT TIME ZONE 'UTC', p.updated_at AT TIME ZONE 'UTC'
     FROM exchange.purchase_orders p
     WHERE p.id = $1
     ON CONFLICT (order_id) DO UPDATE SET
       total = EXCLUDED.total, refiner_fee = EXCLUDED.refiner_fee,
       waive_shipping_fee = EXCLUDED.waive_shipping_fee,
       waive_payout_fee = EXCLUDED.waive_payout_fee,
       shipping_paid = EXCLUDED.shipping_paid,
       shipping_fee_actual = EXCLUDED.shipping_fee_actual,
       pool_remediation = EXCLUDED.pool_remediation,
       pool_oz_deducted = EXCLUDED.pool_oz_deducted,
       updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
    [orderId],
    executor
  );
}

// Line items, including removals. A write that deletes an item from exchange
// has to delete it here too, or the new schema keeps a line the customer is no
// longer being paid for - which is why this deletes what exchange no longer has
// rather than only upserting what it does.
export async function mirrorItems(orderId: string, executor?: Executor): Promise<void> {
  await query(
    `INSERT INTO orders.items (
       id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
       premium, quantity, confirmed, sales_tax_charged, unit,
       price
     )
     SELECT
       poi.id, poi.purchase_order_id, poi.product_id,
       coalesce(s.metal_id, pr.metal_id),
       coalesce(s.pre_melt, pr.gross), coalesce(s.post_melt, pr.content),
       coalesce(s.purity, pr.purity), coalesce(s.content, pr.content),
       coalesce(poi.premium, s.bid_premium), poi.quantity, coalesce(poi.confirmed, false), 0,
       coalesce(s.gross_unit, 't oz'),
       poi.price
     FROM exchange.purchase_order_items poi
     LEFT JOIN exchange.scrap s ON s.id = poi.scrap_id
     LEFT JOIN exchange.products pr ON pr.id = poi.product_id
     WHERE poi.purchase_order_id = $1
     ON CONFLICT (id) DO UPDATE SET
       bullion_id = EXCLUDED.bullion_id, metal_id = EXCLUDED.metal_id,
       pre_melt = EXCLUDED.pre_melt, post_melt = EXCLUDED.post_melt,
       purity = EXCLUDED.purity, content = EXCLUDED.content,
       premium = EXCLUDED.premium, quantity = EXCLUDED.quantity,
       confirmed = EXCLUDED.confirmed, unit = EXCLUDED.unit,
       price = EXCLUDED.price`,
    [orderId],
    executor
  );

  // The refiner's counterpart. What the refinery reported once the scrap was
  // melted lives on its own line now rather than as four `_actual` columns on
  // the order item - see migration 064. One row per purchase-order line, null
  // until the refiner reports.
  //
  // refiner_id is left alone on conflict: exchange has never recorded which
  // refiner a line went to, so a mirror must not overwrite what is already
  // there with a null.
  // refiner_order_id is the ENGAGEMENT link (093): mirrorOrder has already
  // ensured the refiners.orders row, so every mirrored refiner line is born
  // linked. On conflict an existing link is kept and a missing one is filled -
  // never nulled, same rule as refiner_id.
  await query(
    `INSERT INTO refiners.items (
       order_item_id, refiner_order_id, refiner_id, bullion_id, metal_id,
       pre_melt, post_melt, purity, content, premium, quantity, unit
     )
     SELECT
       poi.id, (SELECT ro.id FROM refiners.orders ro WHERE ro.order_id = $1),
       NULL, poi.product_id, coalesce(s.metal_id, pr.metal_id),
       s.pre_melt, s.post_melt_actual, s.purity_actual, s.content_actual,
       poi.refiner_premium, coalesce(poi.quantity, 1), s.gross_unit
     FROM exchange.purchase_order_items poi
     LEFT JOIN exchange.scrap s ON s.id = poi.scrap_id
     LEFT JOIN exchange.products pr ON pr.id = poi.product_id
     WHERE poi.purchase_order_id = $1
       AND coalesce(s.metal_id, pr.metal_id) IS NOT NULL
       AND EXISTS (SELECT 1 FROM orders.items i WHERE i.id = poi.id)
     ON CONFLICT (order_item_id) DO UPDATE SET
       refiner_order_id = coalesce(refiners.items.refiner_order_id, EXCLUDED.refiner_order_id),
       bullion_id = EXCLUDED.bullion_id, metal_id = EXCLUDED.metal_id,
       pre_melt = EXCLUDED.pre_melt, post_melt = EXCLUDED.post_melt,
       purity = EXCLUDED.purity, content = EXCLUDED.content,
       premium = EXCLUDED.premium, quantity = EXCLUDED.quantity,
       unit = EXCLUDED.unit`,
    [orderId],
    executor
  );

  await query(
    `DELETE FROM orders.items i
     WHERE i.order_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM exchange.purchase_order_items poi WHERE poi.id = i.id
       )`,
    [orderId],
    executor
  );
}

// Spot quotes, keyed by order and metal rather than by id - orders.spots
// generates its own, and exchange names the metal as text.
export async function mirrorSpots(orderId: string, executor?: Executor): Promise<void> {
  await query(
    `INSERT INTO orders.spots (
       order_id, metal_id, ask, bid,
       scrap_percentage, bullion_percentage, created_at, updated_at
     )
     SELECT
       coalesce(m.purchase_order_id, m.sales_order_id), mt.id,
       m.ask_spot, m.bid_spot, m.scrap_percentage, m.bullion_percentage,
       m.created_at AT TIME ZONE 'UTC', m.updated_at AT TIME ZONE 'UTC'
     FROM exchange.order_metals m
     JOIN metals.metals mt ON mt.name = m.type
     WHERE coalesce(m.purchase_order_id, m.sales_order_id) = $1
     ON CONFLICT (metal_id, order_id) DO UPDATE SET
       ask = EXCLUDED.ask, bid = EXCLUDED.bid,
       scrap_percentage = EXCLUDED.scrap_percentage,
       bullion_percentage = EXCLUDED.bullion_percentage,
       updated_at = EXCLUDED.updated_at`,
    [orderId],
    executor
  );

  await query(
    `DELETE FROM orders.spots sp
     WHERE sp.order_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM exchange.order_metals m
         JOIN metals.metals mt ON mt.name = m.type
         WHERE coalesce(m.purchase_order_id, m.sales_order_id) = sp.order_id
           AND mt.id = sp.metal_id
       )`,
    [orderId],
    executor
  );
}

// The refiner's spots for an order, re-derived from exchange.
//
// Keyed on the source id rather than on (order, metal): exchange.refiner_metals
// rows carry one and the backfill keeps it, so a row can be matched directly.
// refiner_id and pool_oz_deducted are not touched - exchange has no source for
// either, and a mirror must not overwrite what is already there with a null.
export async function mirrorRefinerSpots(orderId: string, executor?: Executor): Promise<void> {
  // refiner_order_id is the ENGAGEMENT link (093) - filled the same way the
  // items mirror fills it, kept when already set.
  await query(
    `INSERT INTO refiners.spots (
       id, order_id, refiner_order_id, metal_id, ask, bid,
       scrap_percentage, bullion_percentage, created_at, updated_at
     )
     SELECT
       m.id, coalesce(m.purchase_order_id, m.sales_order_id),
       (SELECT ro.id FROM refiners.orders ro WHERE ro.order_id = $1), mt.id,
       m.ask_spot, m.bid_spot, m.scrap_percentage, m.bullion_percentage,
       m.created_at, m.updated_at
     FROM exchange.refiner_metals m
     JOIN metals.metals mt ON mt.name = m.type
     WHERE coalesce(m.purchase_order_id, m.sales_order_id) = $1
     ON CONFLICT (id) DO UPDATE SET
       order_id = EXCLUDED.order_id, metal_id = EXCLUDED.metal_id,
       refiner_order_id = coalesce(refiners.spots.refiner_order_id, EXCLUDED.refiner_order_id),
       ask = EXCLUDED.ask, bid = EXCLUDED.bid,
       scrap_percentage = EXCLUDED.scrap_percentage,
       bullion_percentage = EXCLUDED.bullion_percentage,
       updated_at = EXCLUDED.updated_at`,
    [orderId],
    executor
  );

  await query(
    `DELETE FROM refiners.spots sp
     WHERE sp.order_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM exchange.refiner_metals m WHERE m.id = sp.id
       )`,
    [orderId],
    executor
  );
}

// The address snapshot for an order, taken when the order is created. Kept
// beside the other mirrors because a new purchase order needs one and nothing
// else creates it.
export async function mirrorAddress(orderId: string, executor?: Executor): Promise<void> {
  await query(
    `WITH needed AS MATERIALIZED (
       SELECT p.id AS order_id, a.id AS source_id, gen_random_uuid() AS snapshot_id
       FROM exchange.purchase_orders p
       JOIN exchange.addresses a ON a.id = p.address_id
       WHERE p.id = $1
         AND NOT EXISTS (SELECT 1 FROM orders.addresses oa WHERE oa.order_id = p.id)
     ),
     snapshot AS (
       INSERT INTO places.addresses (
         id, line_1, line_2, city, state, country, zip,
         country_code, phone_number, created_at, updated_at, is_valid, is_residential
       )
       SELECT
         n.snapshot_id, a.line_1, a.line_2, a.city, a.state, a.country, a.zip,
         a.country_code, a.phone_number, a.created_at, a.updated_at,
         a.is_valid, coalesce(a.is_residential, false)
       FROM needed n JOIN exchange.addresses a ON a.id = n.source_id
       RETURNING id
     )
     INSERT INTO orders.addresses (id, address_id, order_id, source_address_id)
     SELECT gen_random_uuid(), n.snapshot_id, n.order_id, n.source_id FROM needed n`,
    [orderId],
    executor
  );
}

// The order id a line item belongs to, for the writes that are handed an item
// id and nothing else. Read from exchange, which is still authoritative.
// Returns the ORDER IDS, plural and de-duplicated, not one id - several items
// can be handed in at once and they may belong to different orders.
export async function orderIdForItems(
  itemIds: string[],
  executor?: Executor
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT DISTINCT purchase_order_id AS id
     FROM exchange.purchase_order_items WHERE id = ANY($1::uuid[])`,
    [itemIds],
    executor
  );
  return rows.map((r) => r.id);
}
