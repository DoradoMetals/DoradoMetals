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
          'purity_actual', ${scrapOnly("i.purity_actual")},
          'post_melt_actual', ${scrapOnly("i.post_melt_actual")},
          'content_actual', ${scrapOnly("i.content_actual")}`
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
        'refiner_premium', i.refiner_premium,
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
export async function findExpiredOffers() {
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
  const { rows } = await query(sql);
  return rows;
}
