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

const shipmentJson = (alias) => `
      jsonb_build_object(
        'id', ${alias}.id,
        'purchase_order_id', ${alias}.purchase_order_id,
        'sales_order_id', ${alias}.sales_order_id,
        'tracking_number', ${alias}.tracking_number,
        'shipping_status', ${alias}.shipping_status,
        'estimated_delivery', ${alias}.estimated_delivery,
        'shipped_at', ${alias}.shipped_at,
        'delivered_at', ${alias}.delivered_at,
        'created_at', ${alias}.created_at,
        'label_type', ${alias}.label_type,
        'pickup_type', ${alias}.pickup_type,
        'package', ${alias}.package,
        'shipping_label', encode(${alias}.shipping_label, 'base64'),
        'shipping_charge', ${alias}.net_charge,
        'shipping_service', ${alias}.service_type,
        'insured', ${alias}.insured,
        'declared_value', ${alias}.declared_value,
        'type', ${alias}.type,
        'carrier_id', ${alias}.carrier_id
      )`;

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
const scrapJson = (withActuals) => {
  const scrapOnly = (expr) => `CASE WHEN i.bullion_id IS NULL THEN ${expr} END`;
  return `
        jsonb_build_object(
          'id', ${scrapOnly("i.id")},
          'pre_melt', ${scrapOnly("i.pre_melt")},
          'post_melt', ${scrapOnly("i.post_melt")},
          'purity', ${scrapOnly("i.purity")},
          'content', ${scrapOnly("i.content")},
          'gross_unit', ${scrapOnly("i.unit")},
          'metal', ${scrapOnly("im.name")},
          'bid_premium', ${scrapOnly("i.bid_premium")}${
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
const ORDER_COLUMNS = `
      o.id,
      o.user_id,
      oa.source_address_id AS address_id,
      o.status AS purchase_order_status,
      o.notes,
      o.created_at,
      o.updated_at,
      o.created_by,
      o.updated_by,
      o.number AS order_number,
      f.offer_expiration AS offer_expires_at,
      f.offer_status,
      f.spots_locked,
      f.offer_sent_at,
      f.notes AS offer_notes,
      f.offer_amount AS total_price,
      f.num_rejections,
      t.waive_shipping_fee,
      t.waive_payout_fee,
      t.shipping_paid,
      o.review_created,
      t.shipping_fee_actual,
      t.refiner_fee,
      t.pool_remediation,
      t.pool_oz_deducted`;

function buildOrderQuery({ where = "", limit = "", withActuals = false } = {}) {
  return `
    SELECT
      ${ORDER_COLUMNS},
      json_agg(DISTINCT jsonb_build_object(
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
      ${shipmentJson("ship")} AS shipment,
      ${shipmentJson("ret")} AS return_shipment,
      to_jsonb(cp) AS carrier_pickup,
      ${payoutJson} AS payout,
      jsonb_build_object(
        'user_id', u.id,
        'user_name', u.name,
        'user_email', u.email
      ) AS "user"
    FROM orders.orders o
    LEFT JOIN orders.offers f ON f.order_id = o.id
    LEFT JOIN orders.transactions t ON t.order_id = o.id
    LEFT JOIN orders.items i ON i.order_id = o.id
    -- The refiner's counterpart to the line: what the refinery reported once the
    -- scrap was melted, as against what the customer declared. 064 made this one
    -- row per purchase-order line, so the join is one-to-one and the values are
    -- null until a refiner reports.
    LEFT JOIN refiners.items ri ON ri.order_item_id = i.id
    LEFT JOIN metals.metals im ON im.id = i.metal_id
    LEFT JOIN products.bullion b ON b.id = i.bullion_id
    LEFT JOIN metals.metals bm ON bm.id = b.metal_id
    LEFT JOIN orders.addresses oa ON oa.order_id = o.id
    LEFT JOIN exchange.addresses addr ON addr.id = oa.source_address_id
    LEFT JOIN exchange.shipments ship ON ship.purchase_order_id = o.id AND ship.type = 'Inbound'
    LEFT JOIN exchange.shipments ret ON ret.purchase_order_id = o.id AND ret.type = 'Return'
    LEFT JOIN exchange.carrier_pickups cp ON cp.order_id = o.id
    LEFT JOIN exchange.payouts pay ON pay.order_id = o.id
    LEFT JOIN exchange.users u ON u.id = o.user_id
    WHERE o.direction = 'purchase'${where ? ` AND ${where}` : ""}
    GROUP BY o.id, f.id, t.id, oa.source_address_id, addr.id, ship.id, ret.id, cp.id, pay.id, u.id
    ORDER BY o.created_at DESC, o.id DESC${limit};
  `;
}

export async function findAllByUser(userId) {
  const { rows } = await query(buildOrderQuery({ where: "o.user_id = $1" }), [userId]);
  return rows;
}

export async function findById(id) {
  const { rows } = await query(
    buildOrderQuery({ where: "o.id = $1", limit: "\n    LIMIT 1" }),
    [id]
  );
  return rows[0] || null;
}

export async function getAll() {
  const { rows } = await query(buildOrderQuery({ withActuals: true }), []);
  return rows;
}

// The metal is a foreign key here and text in exchange, so it is joined back to
// its name. percent_change and dollar_change have no column by design - they
// are null on every row in exchange and nothing writes them - so they are
// projected as null to keep the shape.
export async function findMetalsByOrderId(orderId) {
  const sql = `
    SELECT
      sp.id,
      sp.order_id AS purchase_order_id,
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

// Scrap lines on an order, with what is needed to re-tier their premiums.
export async function findOrderScrapItems(orderId, executor) {
  const sql = `
    SELECT i.id, m.name AS metal, i.content
    FROM orders.items i
    JOIN metals.metals m ON m.id = i.metal_id
    WHERE i.order_id = $1 AND i.bullion_id IS NULL
  `;
  const { rows } = await query(sql, [orderId], executor);
  return rows;
}

// Offers past their expiry. exchange returns the whole purchase order row, so
// the same columns are rebuilt here.
export async function findExpiredOffers(executor) {
  const sql = `
    SELECT ${ORDER_COLUMNS}
    FROM orders.orders o
    LEFT JOIN orders.offers f ON f.order_id = o.id
    LEFT JOIN orders.transactions t ON t.order_id = o.id
    LEFT JOIN orders.addresses oa ON oa.order_id = o.id
    WHERE o.direction = 'purchase'
      AND f.offer_status = 'Sent'
      AND f.offer_expiration IS NOT NULL
      AND f.offer_expiration < NOW();
  `;
  const { rows } = await query(sql, [], executor);
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

export async function mirrorOrder(orderId, executor) {
  await query(
    `INSERT INTO orders.orders (
       id, user_id, refinery_id, direction, status, number, notes,
       review_created, order_sent, tracking_updated,
       created_by, updated_by, created_at, updated_at
     )
     SELECT
       p.id, p.user_id, NULL, 'purchase', p.purchase_order_status, p.order_number,
       p.notes, p.review_created, NULL, NULL, p.created_by, p.updated_by,
       p.created_at AT TIME ZONE 'UTC', p.updated_at AT TIME ZONE 'UTC'
     FROM exchange.purchase_orders p
     WHERE p.id = $1
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id, status = EXCLUDED.status,
       number = EXCLUDED.number, notes = EXCLUDED.notes,
       review_created = EXCLUDED.review_created,
       created_by = EXCLUDED.created_by, updated_by = EXCLUDED.updated_by,
       created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    [orderId],
    executor
  );

  await query(
    `INSERT INTO orders.offers (
       order_id, offer_status, notes, spots_locked, offer_expiration,
       offer_sent_at, num_rejections, offer_amount,
       created_by, updated_by, created_at, updated_at
     )
     SELECT
       p.id, p.offer_status, p.offer_notes, p.spots_locked, p.offer_expires_at,
       p.offer_sent_at, p.num_rejections, p.total_price,
       p.created_by, p.updated_by,
       p.created_at AT TIME ZONE 'UTC', p.updated_at AT TIME ZONE 'UTC'
     FROM exchange.purchase_orders p
     WHERE p.id = $1
     ON CONFLICT (order_id) DO UPDATE SET
       offer_status = EXCLUDED.offer_status, notes = EXCLUDED.notes,
       spots_locked = EXCLUDED.spots_locked,
       offer_expiration = EXCLUDED.offer_expiration,
       offer_sent_at = EXCLUDED.offer_sent_at,
       num_rejections = EXCLUDED.num_rejections,
       offer_amount = EXCLUDED.offer_amount,
       updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
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
export async function mirrorItems(orderId, executor) {
  await query(
    `INSERT INTO orders.items (
       id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
       premium, quantity, confirmed, sales_tax_charged, unit,
       price, bid_premium
     )
     SELECT
       poi.id, poi.purchase_order_id, poi.product_id,
       coalesce(s.metal_id, pr.metal_id),
       coalesce(s.pre_melt, pr.gross), coalesce(s.post_melt, pr.content),
       coalesce(s.purity, pr.purity), coalesce(s.content, pr.content),
       poi.premium, poi.quantity, coalesce(poi.confirmed, false), 0,
       coalesce(s.gross_unit, 't oz'),
       poi.price, s.bid_premium
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
       price = EXCLUDED.price,
       bid_premium = EXCLUDED.bid_premium`,
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

// The address snapshot for an order, taken when the order is created. Kept
// beside the other mirrors because a new purchase order needs one and nothing
// else creates it.
export async function mirrorAddress(orderId, executor) {
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
export async function orderIdForItems(itemIds, executor) {
  const { rows } = await query(
    `SELECT DISTINCT purchase_order_id AS id
     FROM exchange.purchase_order_items WHERE id = ANY($1::uuid[])`,
    [itemIds],
    executor
  );
  return rows.map((r) => r.id);
}
