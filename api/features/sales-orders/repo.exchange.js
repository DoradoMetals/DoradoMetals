// Sales orders read from the legacy exchange schema.
//
// See repo.js for how this and repo.next.js are selected between.
import query from "#shared/db/query.js";
import { calculateItemAsk } from '#features/sales-orders/utils/calculations.js';

// The three lookups below differ only in how they select rows. They were
// previously three identical 65-line copies of the same query.
function buildOrderQuery({ where = "", limit = "" } = {}) {
  return `
    SELECT
      so.*,
      json_agg(DISTINCT jsonb_build_object(
        'id', soi.id,
        'sales_order_id', soi.sales_order_id,
        'price', soi.price,
        'quantity', soi.quantity,
        'premium', soi.premium,
        'product', jsonb_build_object(
          'id', p.id,
          'product_name', p.product_name,
          'content', p.content,
          'product_type', p.product_type,
          'image_front', p.image_front,
          'image_back', p.image_back,
          'bid_premium', p.bid_premium,
          'ask_premium', p.ask_premium,
          'variant_group', p.variant_group,
          'shadow_offset', p.shadow_offset,
          'metal_type', mp.type
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
    FROM exchange.sales_orders so
    LEFT JOIN exchange.sales_order_items soi ON soi.sales_order_id = so.id
    LEFT JOIN exchange.products p ON soi.product_id = p.id
    LEFT JOIN exchange.metals mp ON p.metal_id = mp.id
    LEFT JOIN exchange.addresses addr ON addr.id = so.address_id
    LEFT JOIN exchange.users u ON u.id = so.user_id
    LEFT JOIN exchange.shipments ship ON ship.sales_order_id = so.id
    ${where}
    GROUP BY so.id, addr.id, u.id, ship.id
    ORDER BY so.created_at DESC, so.id DESC${limit};
  `;
}

export async function findById(id) {
  const { rows } = await query(
    buildOrderQuery({ where: "WHERE so.id = $1", limit: "\n    LIMIT 1" }),
    [id]
  );
  return rows[0] || null;
}

export async function findAllByUser(userId) {
  const { rows } = await query(
    buildOrderQuery({ where: "WHERE so.user_id = $1" }),
    [userId]
  );
  return rows;
}

export async function getAll() {
  const { rows } = await query(buildOrderQuery(), []);
  return rows;
}

export async function findMetalsByOrderId(orderId) {
  const sql = `
    SELECT 
      id,
      sales_order_id,
      type,
      ask_spot,
      bid_spot,
      percent_change,
      dollar_change,
      created_at,
      updated_at
    FROM exchange.order_metals
    WHERE sales_order_id = $1
    ORDER BY type ASC, id ASC;
  `;
  const { rows } = await query(sql, [orderId]);
  return rows;
}

export async function insertOrder(client, { user, status, sales_order, orderPrices }) {
  const sql = `
    INSERT INTO exchange.sales_orders (
      user_id,
      address_id,
      sales_order_status,
      order_total,
      shipping_service,
      shipping_cost,
      pre_charges_amount,
      post_charges_amount,
      subject_to_charges_amount,
      used_funds,
      item_total,
      base_total,
      charges_amount,
      sales_tax
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14
    )
    RETURNING id;
  `;
  const values = [
    user.id,
    sales_order.address.id,
    status,
    orderPrices.order_total,
    sales_order.service.label,
    orderPrices.shipping_charge,
    orderPrices.pre_charges_amount,
    orderPrices.post_charges_amount,
    orderPrices.subject_to_charges_amount,
    sales_order.using_funds,
    orderPrices.item_total,
    orderPrices.base_total,
    orderPrices.charges_amount,
    orderPrices.sales_tax,
  ];
  const { rows } = await query(sql, values, client);
  return rows[0].id;
}

export async function insertItems(client, orderId, items, spot_prices) {
  const sql = `
    INSERT INTO exchange.sales_order_items
      (sales_order_id, product_id, price, quantity, premium, sales_tax_rate)
    VALUES
      ($1, $2, $3, $4, $5, $6)
  `;
  for (const item of items) {
    await query(sql, [
      orderId,
      item.id,
      calculateItemAsk(item, spot_prices),
      item.quantity,
      item.ask_premium,
      item.sales_tax_rate,
    ], client);
  }
}

export async function insertOrderMetals(orderId, spot_prices, client) {
  await Promise.all(
    spot_prices.map(async (spot) => {
      const sql = `
        INSERT INTO exchange.order_metals (sales_order_id, type, ask_spot)
        VALUES ($1, $2, $3)
      `;
      const values = [orderId, spot.type, spot.ask_spot];
      await query(sql, values, client);
    })
  );
}

export async function updateStatus(order, order_status, user_name) {
  const sql = `
    UPDATE exchange.sales_orders
    SET
      sales_order_status = $1,
      updated_at = NOW(),
      updated_by = $2
    WHERE id = $3
    RETURNING *;
  `;

  const values = [order_status, user_name, order.id];
  const { rows } = await query(sql, values);
  return rows[0];
}

export async function updateTrackingStatus(orderId) {
  const sql = `
    UPDATE exchange.sales_orders
    SET tracking_updated = true
    WHERE id = $1
    RETURNING *;
  `;
  const { rows } = await query(sql, [orderId]);
  return rows;
}

export async function updateOrderSent(orderId, client) {
  const sql = `
    UPDATE exchange.sales_orders
    SET order_sent = true
    WHERE id = $1
    RETURNING *;
  `;
  const { rows } = await query(sql, [orderId], client);
  return rows;
}

export async function attachSupplierToOrder(id, supplier_id, client) {
  return await query(
    `
    UPDATE exchange.sales_orders
    SET supplier_id = $1
    WHERE id = $2
    RETURNING id, supplier_id
  `,
    [supplier_id, id]
  , client);
}

export async function createReview({order}) {
  const sql = `
    UPDATE exchange.sales_orders
    SET review_created = true
    WHERE id = $1
    RETURNING *;
  `;
  const values = [order.id];
  const { rows } = await query(sql, values);
  return rows[0];
}