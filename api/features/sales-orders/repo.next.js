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
// See features/orders/fragments.js: the shipment and user objects are
// identical in both directions and are now written once.
import { shipmentJson, userJson } from "#features/orders/fragments.js";

// The columns exchange.sales_orders had, rebuilt from the tables they were
// split across. Listed rather than selected with *, so a column appearing on
// one side and not the other shows up as a conflict, not as a quiet change in
// what the API returns.
const ORDER_COLUMNS = `
      o.id,
      o.user_id,
      oa.source_address_id AS address_id,
      o.status AS sales_order_status,
      o.notes,
      o.created_at,
      o.updated_at,
      o.created_by,
      o.updated_by,
      o.number AS order_number,
      t.total AS order_total,
      o.review_created,
      t.shipping_service,
      t.shipping AS shipping_cost,
      t.funds AS pre_charges_amount,
      t.post_charges_amount,
      t.subject_to_charges_amount,
      t.used_funds,
      t.items AS item_total,
      t.base_total,
      t.surcharge AS charges_amount,
      o.order_sent,
      o.tracking_updated,
      t.sales_tax,
      o.refinery_id AS supplier_id`;

function buildOrderQuery({ where = "", limit = "" } = {}) {
  return `
    SELECT
      ${ORDER_COLUMNS},
      json_agg(DISTINCT jsonb_build_object(
        'id', i.id,
        'sales_order_id', i.order_id,
        'price', i.price,
        'quantity', i.quantity,
        'premium', i.premium,
        'product', jsonb_build_object(
          'id', b.id,
          'product_name', b.name,
          'content', b.content,
          'product_type', b.type,
          'image_front', b.image_front,
          'image_back', b.image_back,
          'bid_premium', b.bid_premium,
          'ask_premium', b.ask_premium,
          'variant_group', b.variant_group,
          'shadow_offset', b.shadow_offset,
          'metal_type', bm.name
        )
      )) AS order_items,
      to_jsonb(addr) AS address,
      ${userJson()} AS "user",
      ${shipmentJson("ship")} AS shipment
    FROM orders.orders o
    LEFT JOIN orders.transactions t ON t.order_id = o.id
    LEFT JOIN orders.items i ON i.order_id = o.id
    LEFT JOIN products.bullion b ON b.id = i.bullion_id
    LEFT JOIN metals.metals bm ON bm.id = b.metal_id
    LEFT JOIN orders.addresses oa ON oa.order_id = o.id
    LEFT JOIN exchange.addresses addr ON addr.id = oa.source_address_id
    LEFT JOIN exchange.users u ON u.id = o.user_id
    LEFT JOIN exchange.shipments ship ON ship.sales_order_id = o.id
    WHERE o.direction = 'sale'${where ? ` AND ${where}` : ""}
    GROUP BY o.id, t.id, oa.source_address_id, addr.id, u.id, ship.id
    ORDER BY o.created_at DESC, o.id DESC${limit};
  `;
}

export async function findById(id) {
  const { rows } = await query(
    buildOrderQuery({ where: "o.id = $1", limit: "\n    LIMIT 1" }),
    [id]
  );
  return rows[0] || null;
}

export async function findAllByUser(userId) {
  const { rows } = await query(buildOrderQuery({ where: "o.user_id = $1" }), [userId]);
  return rows;
}

export async function getAll() {
  const { rows } = await query(buildOrderQuery(), []);
  return rows;
}

// percent_change and dollar_change have no column by design - null on every row
// in exchange, and nothing writes them - so they are projected to keep the shape.
export async function findMetalsByOrderId(orderId) {
  const sql = `
    SELECT
      sp.id,
      sp.order_id AS sales_order_id,
      m.name AS type,
      sp.ask AS ask_spot,
      sp.bid AS bid_spot,
      NULL::numeric AS percent_change,
      NULL::numeric AS dollar_change,
      sp.created_at,
      sp.updated_at
    FROM orders.spots sp
    JOIN metals.metals m ON m.id = sp.metal_id
    WHERE sp.order_id = $1
    ORDER BY m.name ASC, sp.id ASC;
  `;
  const { rows } = await query(sql, [orderId]);
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

export async function mirrorOrder(orderId, executor) {
  await query(
    `INSERT INTO orders.orders (
       id, user_id, refinery_id, direction, status, number, notes,
       review_created, order_sent, tracking_updated,
       created_by, updated_by, created_at, updated_at
     )
     SELECT
       s.id, s.user_id,
       (SELECT r.id FROM refiners.refiners r WHERE r.id = s.supplier_id),
       'sale', s.sales_order_status, s.order_number, s.notes, s.review_created,
       s.order_sent, s.tracking_updated, s.created_by, s.updated_by,
       s.created_at AT TIME ZONE 'UTC', s.updated_at AT TIME ZONE 'UTC'
     FROM exchange.sales_orders s
     WHERE s.id = $1
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id, refinery_id = EXCLUDED.refinery_id,
       status = EXCLUDED.status, number = EXCLUDED.number, notes = EXCLUDED.notes,
       review_created = EXCLUDED.review_created,
       order_sent = EXCLUDED.order_sent,
       tracking_updated = EXCLUDED.tracking_updated,
       created_by = EXCLUDED.created_by, updated_by = EXCLUDED.updated_by,
       created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
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
export async function mirrorItems(orderId, executor) {
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
export async function mirrorSpots(orderId, executor) {
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
export async function mirrorAddress(orderId, executor) {
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
