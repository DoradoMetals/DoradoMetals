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
import type { PurchaseOrder } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// The order row is PurchaseOrder - validate:wire parses real rows
// through it for BOTH implementations, so it is the description of this shape
// that has been checked against the database rather than read off the SQL.
//
// The two timestamps are overridden: a contract describes the WIRE, where a
// timestamp is a string because JSON made it one, and pg returns a Date.
export type PurchaseOrderRow = Omit<
  PurchaseOrder,
  "created_at" | "updated_at"
> & {
  created_at: Date | null;
  updated_at: Date | null;
};

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
// The fragments both directions read identically. They were duplicated field
// for field between this file and sales-orders/repo.next.ts; the duplication
// was checked programmatically before being removed, not by eye.
import {
  shipmentJson,
  userJson,
  sharedJoins,
  newestFirst,
} from "#features/orders/fragments.ts";


// Only the last four digits of a bank account travel with an order. Unchanged
// from the exchange implementation, and it must stay that way.
const payoutJson = `
      jsonb_build_object(
        'id', pay.id,
        'user_id', pay.user_id,
        'order_id', pay.order_id,
        'method', pay.method,
        'account_holder_name', pay.account_holder_name,
        'bank_name', pay.bank_name,
        'account_type', pay.account_type,
        'account_last4', right(pay.account_number, 4),
        'routing_last4', right(pay.routing_number, 4),
        'email_to', pay.email_to,
        'cost', pay.cost,
        'created_at', pay.created_at
      )`;

// exchange.scrap does not exist here: a scrap line's weights live on the item
// itself, because a scrap row was never an entity anyone referred to. The
// object is rebuilt from those columns so the response is unchanged.
//
// It is emitted for every line, including bullion ones, where every field comes
// out null. That looks pointless and is not: exchange LEFT JOINs scrap and
// builds the object regardless, so a bullion line already carries a scrap
// object full of nulls. Returning null instead would be a different shape, and
// `item.scrap.content` would start throwing where it used to give undefined.
//
// `id` is the one field that cannot be what it was. exchange returns the scrap
// row's id; there is no scrap row now, so it returns the line's. Nothing reads
// it - the admin table keys on the item - but it is a different value, and it
// is declared in the diff rather than hidden.
const scrapJson = (withActuals: boolean): string => {
  const scrapOnly = (expr: string) => `CASE WHEN i.bullion_id IS NULL THEN ${expr} END`;
  return `
        jsonb_build_object(
          'id', ${scrapOnly("i.id")},
          'pre_melt', ${scrapOnly("i.pre_melt")},
          'post_melt', ${scrapOnly("i.post_melt")},
          'purity', ${scrapOnly("i.purity")},
          'content', ${scrapOnly("i.content")},
          'gross_unit', ${scrapOnly("i.unit")},
          'metal', ${scrapOnly("im.name")},
          'bid_premium', ${scrapOnly("i.premium")}${
            withActuals
              ? `,
          'purity_actual', ${scrapOnly("ri.purity")},
          'post_melt_actual', ${scrapOnly("ri.post_melt")},
          'content_actual', ${scrapOnly("ri.content")}`
              : ""
          }
        )`;
};

// The columns exchange.purchase_orders had, rebuilt from the four tables they
// were split across. Named explicitly rather than with po.*, so that a column
// appearing on one side and not the other is a merge conflict rather than a
// silent change in what the API returns.
// The column order matches repo.exchange.js exactly - `diff` serialises rows
// to compare them, and a reordering reads as a divergence. The money is not
// here any more: it nests as `totals` in the query below, under
// orders.transactions' own names (D84).
const ORDER_COLUMNS = `
      o.id,
      o.user_id,
      oa.source_address_id AS address_id,
      o.status,
      o.notes,
      o.created_at,
      o.updated_at,
      o.created_by,
      o.updated_by,
      o.number,
      o.spots_locked,
      t.waive_shipping_fee,
      t.waive_payout_fee,
      t.shipping_paid,
      o.review_created,
      t.shipping_fee_actual,
      t.pool_remediation,
      t.pool_oz_deducted`;

function buildOrderQuery(
  { where = "", limit = "", withActuals = false }:
    { where?: string; limit?: string; withActuals?: boolean } = {}
): string {
  return `
    SELECT
      ${ORDER_COLUMNS},
      -- The money, under orders.transactions' own names. Always an object,
      -- never NULL: exchange always has its flat row, so an order whose
      -- transactions row is missing (the strays) still carries the keys,
      -- each null - which is what the flat columns produced before.
      jsonb_build_object(
        'total', t.total,
        'items', t.items,
        'shipping', t.shipping,
        'surcharge', t.surcharge,
        'sales_tax', t.sales_tax,
        'funds', t.funds,
        'refiner_fee', t.refiner_fee,
        'base_total', t.base_total,
        'subject_to_charges_amount', t.subject_to_charges_amount,
        'post_charges_amount', t.post_charges_amount
      ) AS totals,
      -- FILTER + COALESCE: an order with no lines aggregates NOTHING rather
      -- than one all-null object. Without the filter, json_agg over the LEFT
      -- JOIN yields a single row of nulls which the item_type CASE then labels
      -- a scrap line - the D53 artifact, reproduced from exchange. The composed
      -- read (read.service.ts) already returns [] for these; this makes the
      -- mirror agree with it.
      COALESCE(json_agg(DISTINCT jsonb_build_object(
        'id', i.id,
        'purchase_order_id', i.order_id,
        'price', i.price,
        'quantity', i.quantity,
        'confirmed', i.confirmed,
        'premium', i.premium,
        'refiner_premium', ri.premium,
        'item_type', CASE
          WHEN i.bullion_id IS NULL THEN 'scrap'
          ELSE 'product'
        END,
        'scrap', ${scrapJson(withActuals)},
        'product', jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'description', b.description,
          'type', b.type,
          'metal_type', bm.name,
          'content', b.content,
          'gross', b.gross,
          'purity', b.purity,
          'bid_premium', b.bid_premium,
          'ask_premium', b.ask_premium,
          'image_front', b.image_front,
          'image_back', b.image_back,
          'mint_name', mnt.name
        )
      )) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS order_items,
      -- THE SNAPSHOT SHAPE (D84). address_id is the BOOK id - see the header -
      -- and recipient_name is what the book's smeared name column always meant on an order.
      -- CASE keeps "no address" null, exactly as to_jsonb(addr) was.
      CASE WHEN addr.id IS NULL THEN NULL ELSE jsonb_build_object(
        'address_id', addr.id,
        'recipient_name', addr.name,
        'line_1', addr.line_1,
        'line_2', addr.line_2,
        'city', addr.city,
        'state', addr.state,
        'country', addr.country,
        'country_code', addr.country_code,
        'zip', addr.zip,
        'phone_number', addr.phone_number,
        'is_residential', addr.is_residential,
        'is_valid', addr.is_valid
      ) END AS address,
      ${shipmentJson("ship")} AS shipment,
      ${shipmentJson("ret")} AS return_shipment,
      to_jsonb(cp) AS carrier_pickup,
      ${payoutJson} AS payout,
      ${userJson()} AS "user"
    FROM orders.orders o
    ${sharedJoins}
    -- The refiner's counterpart to the line: what the refinery reported once the
    -- scrap was melted, as against what the customer declared. 064 made this one
    -- row per purchase-order line, so the join is one-to-one and the values are
    -- null until a refiner reports.
    LEFT JOIN refiners.items ri ON ri.order_item_id = i.id
    LEFT JOIN metals.metals im ON im.id = i.metal_id
    LEFT JOIN exchange.shipments ship ON ship.purchase_order_id = o.id AND ship.type = 'Inbound'
    LEFT JOIN exchange.shipments ret ON ret.purchase_order_id = o.id AND ret.type = 'Return'
    LEFT JOIN exchange.carrier_pickups cp ON cp.order_id = o.id
    LEFT JOIN exchange.payouts pay ON pay.order_id = o.id
    WHERE o.direction = 'purchase'${where ? ` AND ${where}` : ""}
    GROUP BY o.id, t.id, oa.source_address_id, addr.id, ship.id, ret.id, cp.id, pay.id, u.id
    ${newestFirst}${limit};
  `;
}

export async function findAllByUser(userId: string): Promise<PurchaseOrderRow[]> {
  const { rows } = await query<PurchaseOrderRow>(buildOrderQuery({ where: "o.user_id = $1" }), [userId]);
  return rows;
}

// `|| null` rather than `?? null`, matching repo.exchange.js exactly.
export async function findById(id: string): Promise<PurchaseOrderRow | null> {
  const { rows } = await query<PurchaseOrderRow>(
    buildOrderQuery({ where: "o.id = $1", limit: "\n    LIMIT 1" }),
    [id]
  );
  return rows[0] || null;
}

export async function getAll(): Promise<PurchaseOrderRow[]> {
  const { rows } = await query<PurchaseOrderRow>(buildOrderQuery({ withActuals: true }), []);
  return rows;
}

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
       id, user_id, refinery_id, direction, status, number, notes,
       review_created, order_sent, tracking_updated, spots_locked,
       created_by, updated_by, created_at, updated_at
     )
     SELECT
       p.id, p.user_id, NULL, 'purchase', p.purchase_order_status, p.order_number,
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
  await query(
    `INSERT INTO refiners.items (
       order_item_id, refiner_id, bullion_id, metal_id,
       pre_melt, post_melt, purity, content, premium, quantity, unit
     )
     SELECT
       poi.id, NULL, poi.product_id, coalesce(s.metal_id, pr.metal_id),
       s.pre_melt, s.post_melt_actual, s.purity_actual, s.content_actual,
       poi.refiner_premium, coalesce(poi.quantity, 1), s.gross_unit
     FROM exchange.purchase_order_items poi
     LEFT JOIN exchange.scrap s ON s.id = poi.scrap_id
     LEFT JOIN exchange.products pr ON pr.id = poi.product_id
     WHERE poi.purchase_order_id = $1
       AND coalesce(s.metal_id, pr.metal_id) IS NOT NULL
       AND EXISTS (SELECT 1 FROM orders.items i WHERE i.id = poi.id)
     ON CONFLICT (order_item_id) DO UPDATE SET
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
  await query(
    `INSERT INTO refiners.spots (
       id, order_id, metal_id, ask, bid,
       scrap_percentage, bullion_percentage, created_at, updated_at
     )
     SELECT
       m.id, coalesce(m.purchase_order_id, m.sales_order_id), mt.id,
       m.ask_spot, m.bid_spot, m.scrap_percentage, m.bullion_percentage,
       m.created_at, m.updated_at
     FROM exchange.refiner_metals m
     JOIN metals.metals mt ON mt.name = m.type
     WHERE coalesce(m.purchase_order_id, m.sales_order_id) = $1
     ON CONFLICT (id) DO UPDATE SET
       order_id = EXCLUDED.order_id, metal_id = EXCLUDED.metal_id,
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
