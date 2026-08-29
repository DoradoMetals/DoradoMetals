// THE DUAL-WRITE MIRROR, both directions: exchange -> the orders schema.
//
// Was features/purchase-orders/repo.next.ts and
// features/sales-orders/repo.next.ts. `.next` was migration-era vocabulary
// from when a *_SOURCE switch chose between two implementations; there is no
// switch, so the file is named for what it does. Direction is a COLUMN, so
// both live here - but nothing is SHARED between the two halves and that is
// honest: each re-derives from a DIFFERENT exchange table
// (exchange.purchase_orders, exchange.sales_orders) into the same targets.
//
// THE MIRROR RE-DERIVES rather than applying the same change twice. There are
// 29 writes and a per-write mirror would be 29 chances to map a column wrong;
// instead each write says which part of the order it disturbed and that part
// is rebuilt from what exchange now holds. It is the same INSERT ... SELECT
// the backfill uses, so there is ONE definition of an order in the new schema.
//
// Everything is server-side. Nothing round-trips through JS, because a JS Date
// truncates microseconds - the bug migration 015 had to undo.
//
// Every function takes the caller's executor so the mirror joins the same
// transaction as the write it follows. If it opened its own, a rolled-back
// write would leave a mirrored row behind, which is the exact divergence the
// dual write exists to prevent.
//
// *** THE SALE HALF HAS NO PRODUCT-CODE CALLER (found in wave 5A). ***
// features/orders/repo.dual.js drives the purchase mirrors; a sales order is
// dual-written DIRECTLY by write.service.ts, which writes both schemas from
// the same values instead of re-deriving. So mirrorSalesOrder and its three
// siblings are exercised only by their tests today. NOT deleted, because
// deleting a mirror is a data decision (D105) and Jacob's call, and the tests
// that drive them are a real proof that exchange and orders.* agree column by
// column. Recorded here so the next session does not rediscover it.

import query from "#shared/db/query.js";
import type { ComposedOrder } from "#features/orders/compose.ts";
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
export type PurchaseOrderMetalRow = {
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
export async function findPurchaseMetalsByOrderId(orderId: string): Promise<PurchaseOrderMetalRow[]> {
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
  const { rows } = await query<PurchaseOrderMetalRow>(sql, [orderId]);
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
export async function findRefinerMetalsByOrderId(orderId: string): Promise<PurchaseOrderMetalRow[]> {
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
  const { rows } = await query<PurchaseOrderMetalRow>(sql, [orderId]);
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

export async function mirrorPurchaseOrder(orderId: string, executor?: Executor): Promise<void> {
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
export async function mirrorPurchaseItems(orderId: string, executor?: Executor): Promise<void> {
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
export async function mirrorPurchaseSpots(orderId: string, executor?: Executor): Promise<void> {
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
export async function mirrorPurchaseAddress(orderId: string, executor?: Executor): Promise<void> {
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

// ===========================================================================
// THE SALE DIRECTION - exchange.sales_orders and its two children.
// ===========================================================================
import type { ComposedSalesOrder } from "#features/orders/compose.ts";

// The order row is ComposedSalesOrder, the API's OWN assembled shape - see
// compose.ts. It was the SalesOrder contract until wave 3, when the wire
// slimmed to the orders.orders row plus totals; `diff` and
// verify:sales-order-decomposition are what check it now.
export type SalesOrderRow = ComposedSalesOrder;

// The per-metal spot row an order carries. There is deliberately no contract
// for this one - it is not returned by any route on its own, only alongside an
// order - so it is spelled out here.
//
// percent_change and dollar_change have NO column in the new schema and are
// projected as NULL to keep the shape. They are null on every row in exchange
// too, and nothing writes them; CLAUDE.md lists percent_change among the
// columns that are 100% NULL and still referenced by live code.
export type SalesOrderMetalRow = {
  id: string;
  sales_order_id: string | null;
  name: string;
  ask: number | null;
  bid: number | null;
  percent_change: number | null;
  dollar_change: number | null;
  created_at: Date | null;
  updated_at: Date | null;
};

// THE COMPOSED ORDER READS ARE GONE with the read pivot (ruling 8):
// read.service.ts is THE sales-order read, assembled from the per-table
// repos. What remains here is the dual-write MIRROR machinery and the
// per-metal spot read.


// percent_change and dollar_change have no column by design - null on every row
// in exchange, and nothing writes them - so they are projected to keep the shape.
export async function findSalesMetalsByOrderId(orderId: string): Promise<SalesOrderMetalRow[]> {
  const sql = `
    SELECT
      sp.id,
      sp.order_id AS sales_order_id,
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
  const { rows } = await query<SalesOrderMetalRow>(sql, [orderId]);
  return rows;
}

// ---------------------------------------------------------------- mirroring
//
// The dual-write phase copies a sales order across after exchange has been
// written to. Same approach as purchase orders: rather than a mirror per write,
// the whole order is re-derived from exchange, so there is one definition of
// what a sales order looks like in the new schema and every write exercises it.
//
// Server-side throughout. Nothing round-trips through JS, because a JS Date
// truncates microseconds - the bug migration 015 had to undo.
//
// Every function takes the caller's executor so the mirror joins the same
// transaction as the write it follows.

export async function mirrorSalesOrder(orderId: string, executor?: Executor): Promise<void> {
  await query(
    `INSERT INTO orders.orders (
       id, user_id, direction, status, number, notes,
       review_created, order_sent, tracking_updated,
       created_by, updated_by, created_at, updated_at
     )
     SELECT
       s.id, s.user_id,
       'sale', s.sales_order_status, s.order_number, s.notes, s.review_created,
       s.order_sent, s.tracking_updated, s.created_by, s.updated_by,
       s.created_at AT TIME ZONE 'UTC', s.updated_at AT TIME ZONE 'UTC'
     FROM exchange.sales_orders s
     WHERE s.id = $1
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       status = EXCLUDED.status, number = EXCLUDED.number, notes = EXCLUDED.notes,
       review_created = EXCLUDED.review_created,
       order_sent = EXCLUDED.order_sent,
       tracking_updated = EXCLUDED.tracking_updated,
       created_by = EXCLUDED.created_by, updated_by = EXCLUDED.updated_by,
       created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    [orderId],
    executor
  );

  // WHICH REFINERY HAS THE METAL lands on the ENGAGEMENT (refiners.orders,
  // 093) - orders.orders.refinery_id dropped in 094. The upsert both ensures
  // the one-engagement-per-order invariant for a row this mirror just created
  // and re-derives refiner_id from exchange's supplier_id, validated against
  // refiners.refiners the way the old column's mirror was.
  await query(
    `INSERT INTO refiners.orders (order_id, refiner_id)
     SELECT s.id, (SELECT r.id FROM refiners.refiners r WHERE r.id = s.supplier_id)
       FROM exchange.sales_orders s
      WHERE s.id = $1
     ON CONFLICT (order_id) DO UPDATE
       SET refiner_id = EXCLUDED.refiner_id, updated_at = now()`,
    [orderId],
    executor
  );

  // The money. A sales order has no offer, so there is no third table here -
  // which is the difference the unified schema is for.
  await query(
    `INSERT INTO orders.transactions (
       order_id, total, items, shipping, shipping_service, surcharge, sales_tax,
       funds, base_total, post_charges_amount, subject_to_charges_amount,
       used_funds, refiner_fee, created_by, updated_by, created_at, updated_at
     )
     SELECT
       s.id, s.order_total, s.item_total, s.shipping_cost, s.shipping_service,
       s.charges_amount, s.sales_tax, s.pre_charges_amount, s.base_total,
       s.post_charges_amount, s.subject_to_charges_amount, s.used_funds, 0,
       s.created_by, s.updated_by,
       s.created_at AT TIME ZONE 'UTC', s.updated_at AT TIME ZONE 'UTC'
     FROM exchange.sales_orders s
     WHERE s.id = $1
     ON CONFLICT (order_id) DO UPDATE SET
       total = EXCLUDED.total, items = EXCLUDED.items,
       shipping = EXCLUDED.shipping, shipping_service = EXCLUDED.shipping_service,
       surcharge = EXCLUDED.surcharge, sales_tax = EXCLUDED.sales_tax,
       funds = EXCLUDED.funds, base_total = EXCLUDED.base_total,
       post_charges_amount = EXCLUDED.post_charges_amount,
       subject_to_charges_amount = EXCLUDED.subject_to_charges_amount,
       used_funds = EXCLUDED.used_funds,
       updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
    [orderId],
    executor
  );
}

// Line items. A sales order line is always a product, so the weights come from
// the product rather than from a scrap row, and confirmed stays false -
// exchange.sales_order_items has no such column because nothing is confirmed on
// the way out.
export async function mirrorSalesItems(orderId: string, executor?: Executor): Promise<void> {
  await query(
    `INSERT INTO orders.items (
       id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
       premium, quantity, confirmed, sales_tax_charged, unit, price
     )
     SELECT
       soi.id, soi.sales_order_id, soi.product_id, pr.metal_id,
       pr.gross, pr.content, pr.purity, pr.content,
       soi.premium, soi.quantity, false, soi.sales_tax_rate, 't oz', soi.price
     FROM exchange.sales_order_items soi
     JOIN exchange.products pr ON pr.id = soi.product_id
     WHERE soi.sales_order_id = $1
     ON CONFLICT (id) DO UPDATE SET
       bullion_id = EXCLUDED.bullion_id, metal_id = EXCLUDED.metal_id,
       pre_melt = EXCLUDED.pre_melt, post_melt = EXCLUDED.post_melt,
       purity = EXCLUDED.purity, content = EXCLUDED.content,
       premium = EXCLUDED.premium, quantity = EXCLUDED.quantity,
       sales_tax_charged = EXCLUDED.sales_tax_charged, price = EXCLUDED.price`,
    [orderId],
    executor
  );

  await query(
    `DELETE FROM orders.items i
     WHERE i.order_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM exchange.sales_order_items soi WHERE soi.id = i.id
       )`,
    [orderId],
    executor
  );
}

// Spot quotes, keyed by order and metal. exchange.order_metals serves both
// kinds of order and names the metal as text.
export async function mirrorSalesSpots(orderId: string, executor?: Executor): Promise<void> {
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
     ON CONFLICT (order_id, metal_id) DO UPDATE SET
       ask = EXCLUDED.ask, bid = EXCLUDED.bid,
       scrap_percentage = EXCLUDED.scrap_percentage,
       bullion_percentage = EXCLUDED.bullion_percentage,
       updated_at = EXCLUDED.updated_at`,
    [orderId],
    executor
  );
}

// The address snapshot, taken when the order is created.
export async function mirrorSalesAddress(orderId: string, executor?: Executor): Promise<void> {
  await query(
    `WITH needed AS MATERIALIZED (
       SELECT s.id AS order_id, a.id AS source_id, gen_random_uuid() AS snapshot_id
       FROM exchange.sales_orders s
       JOIN exchange.addresses a ON a.id = s.address_id
       WHERE s.id = $1
         AND NOT EXISTS (SELECT 1 FROM orders.addresses oa WHERE oa.order_id = s.id)
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
