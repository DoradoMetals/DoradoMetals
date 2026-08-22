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
      jsonb_build_object(
        'user_id', u.id,
        'user_name', u.name,
        'user_email', u.email
      ) AS "user",
      jsonb_build_object(
        'id', ship.id,
        'purchase_order_id', ship.purchase_order_id,
        'sales_order_id', ship.sales_order_id,
        'tracking_number', ship.tracking_number,
        'shipping_status', ship.shipping_status,
        'estimated_delivery', ship.estimated_delivery,
        'shipped_at', ship.shipped_at,
        'delivered_at', ship.delivered_at,
        'created_at', ship.created_at,
        'label_type', ship.label_type,
        'pickup_type', ship.pickup_type,
        'package', ship.package,
        'shipping_label', encode(ship.shipping_label, 'base64'),
        'shipping_charge', ship.net_charge,
        'shipping_service', ship.service_type,
        'insured', ship.insured,
        'declared_value', ship.declared_value,
        'type', ship.type,
        'carrier_id', ship.carrier_id
      ) AS shipment
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
