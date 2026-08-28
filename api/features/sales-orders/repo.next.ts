// Sales orders read from the orders schema.
//
// The other half of what orders.orders unifies. A sales order is three rows
// here - the order, its money, its lines - against the purchase order's four;
// it has no offer, which is the point of keeping offers in their own table
// rather than as columns that are null on half of them.
//
// Reads only. Every write still goes to exchange through repo.exchange.js.
//
// As with purchase orders, the address id returned is the address-book id the
// snapshot was taken from, not the snapshot's, because the frontend posts it
// back at checkout and the API resolves it against exchange.addresses.
// Shipments and users are still read from exchange, unmigrated.
import query from "#shared/db/query.js";
import type { SalesOrder } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// The order row is SalesOrder - the converted shape (D84), which
// validate:wire parses real rows through, so it is the description of this
// shape that has been checked against the database rather than read off the
// SQL.
//
// Its two timestamps are overridden. A contract describes the WIRE, where a
// timestamp is a string because JSON made it one; pg returns a Date. The rest
// of the shape - the nested totals, address, shipment, user and items - is
// taken exactly as declared.
export type SalesOrderRow = Omit<SalesOrder, "created_at" | "updated_at"> & {
  created_at: Date | null;
  updated_at: Date | null;
};

// The per-metal spot row an order carries. There is deliberately no contract
// for this one - it is not returned by any route on its own, only alongside an
// order - so it is spelled out here.
//
// percent_change and dollar_change have NO column in the new schema and are
// projected as NULL to keep the shape. They are null on every row in exchange
// too, and nothing writes them; CLAUDE.md lists percent_change among the
// columns that are 100% NULL and still referenced by live code.
export type OrderMetalRow = {
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
export async function findMetalsByOrderId(orderId: string): Promise<OrderMetalRow[]> {
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
  const { rows } = await query<OrderMetalRow>(sql, [orderId]);
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

export async function mirrorOrder(orderId: string, executor?: Executor): Promise<void> {
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
export async function mirrorItems(orderId: string, executor?: Executor): Promise<void> {
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
export async function mirrorAddress(orderId: string, executor?: Executor): Promise<void> {
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
