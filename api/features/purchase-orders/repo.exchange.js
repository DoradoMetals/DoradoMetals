// Purchase orders read from the legacy exchange schema.
//
// See repo.js for how this and repo.next.js are selected between.
import query from "#shared/db/query.js";
import { calculateItemPrice } from '#features/purchase-orders/utils/calculations.js';

// The three order lookups below differ only in how they select rows, so the
// projection and joins are built once here. They previously existed as three
// near-identical 110-line queries that had already drifted apart.

// Shipments are joined twice per order (inbound and return), so the same
// projection is emitted for each alias.
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

// Payouts hold bank routing and account numbers. to_jsonb(pay) splatted the
// whole row into every order response, so the admin orders table shipped every
// customer's bank credentials to the browser on each load. Only the last four
// digits travel with an order now; the full values are read one order at a time
// through the admin-only payout-details endpoint.
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

// The post-melt assay figures are admin-only, so customer-facing lookups omit
// them. Only the admin getAll() query passes withActuals.
const scrapJson = (withActuals) => `
        jsonb_build_object(
          'id', s.id,
          'pre_melt', s.pre_melt,
          'post_melt', s.post_melt,
          'purity', s.purity,
          'content', s.content,
          'gross_unit', s.gross_unit,
          'metal', ms.type,
          'bid_premium', s.bid_premium${
            withActuals
              ? `,
          'purity_actual', s.purity_actual,
          'post_melt_actual', s.post_melt_actual,
          'content_actual', s.content_actual`
              : ""
          }
        )`;

function buildOrderQuery({ where = "", limit = "", withActuals = false } = {}) {
  return `
    SELECT
      po.*,
      json_agg(DISTINCT jsonb_build_object(
        'id', poi.id,
        'purchase_order_id', poi.purchase_order_id,
        'price', poi.price,
        'quantity', poi.quantity,
        'confirmed', poi.confirmed,
        'premium', poi.premium,
        'refiner_premium', poi.refiner_premium,
        'item_type', CASE
          WHEN poi.scrap_id IS NOT NULL THEN 'scrap'
          WHEN poi.product_id IS NOT NULL THEN 'product'
          ELSE 'unknown'
        END,
        'scrap', ${scrapJson(withActuals)},
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
      ${shipmentJson("ship")} AS shipment,
      ${shipmentJson("ret")} AS return_shipment,
      to_jsonb(cp) AS carrier_pickup,
      ${payoutJson} AS payout,
      jsonb_build_object(
        'user_id', u.id,
        'user_name', u.name,
        'user_email', u.email
      ) AS "user"
    FROM exchange.purchase_orders po
    LEFT JOIN exchange.purchase_order_items poi ON poi.purchase_order_id = po.id
    LEFT JOIN exchange.scrap s ON poi.scrap_id = s.id
    LEFT JOIN exchange.products p ON poi.product_id = p.id
    LEFT JOIN exchange.metals ms ON s.metal_id = ms.id
    LEFT JOIN exchange.metals mp ON p.metal_id = mp.id
    LEFT JOIN exchange.addresses addr ON addr.id = po.address_id
    LEFT JOIN exchange.shipments ship ON ship.purchase_order_id = po.id AND ship.type = 'Inbound'
    LEFT JOIN exchange.shipments ret ON ret.purchase_order_id = po.id AND ret.type = 'Return'
    LEFT JOIN exchange.carrier_pickups cp ON cp.order_id = po.id
    LEFT JOIN exchange.payouts pay ON pay.order_id = po.id
    LEFT JOIN exchange.users u ON u.id = po.user_id
    ${where}
    GROUP BY po.id, addr.id, ship.id, ret.id, cp.id, pay.id, u.id
    ORDER BY po.created_at DESC, po.id DESC${limit};
  `;
}

export async function findAllByUser(userId) {
  const { rows } = await query(
    buildOrderQuery({ where: "WHERE po.user_id = $1" }),
    [userId]
  );
  return rows;
}

export async function findById(id) {
  const { rows } = await query(
    buildOrderQuery({ where: "WHERE po.id = $1", limit: "\n    LIMIT 1" }),
    [id]
  );
  return rows[0] || null;
}

export async function getAll() {
  const { rows } = await query(buildOrderQuery({ withActuals: true }), []);
  return rows;
}

export async function findMetalsByOrderId(orderId) {
  const sql = `
    SELECT 
      id,
      purchase_order_id,
      type,
      ask_spot,
      bid_spot,
      percent_change,
      dollar_change,
      created_at,
      updated_at
    FROM exchange.order_metals
    WHERE purchase_order_id = $1
    ORDER BY type ASC, id ASC;
  `;
  const { rows } = await query(sql, [orderId]);
  return rows;
}

export async function updateOrderMetals(orderId, spotPrices, client) {
  const updates = await Promise.all(
    spotPrices.map(async (spot) => {
      const sql = `
        UPDATE exchange.order_metals
        SET bid_spot = $1
        WHERE purchase_order_id = $2
        AND type = $3
        RETURNING *;
      `;
      const vals = [spot.bid_spot, orderId, spot.type];
      const { rows } = await query(sql, vals, client);
      return rows[0];
    })
  );
  return updates;
}

export async function updateOrderItemPrices(orderId, items, spotRows, client) {
  await Promise.all(
    items.map((item) => {
      const price = calculateItemPrice(item, spotRows);
      const sql = `
        UPDATE exchange.purchase_order_items
        SET price = $1
        WHERE id = $2
        AND purchase_order_id = $3;
      `;
      return query(sql, [price, item.id, orderId], client);
    })
  );
}

export async function moveOrderToAccepted(orderId, totalPrice, client) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET offer_status = $1,
        purchase_order_status = $2,
        total_price = $3,
        spots_locked = TRUE
    WHERE id = $4;
  `;
  await query(sql, ["Accepted", "Accepted", totalPrice, orderId], client);
}

export async function rejectOfferById(orderId, offerNotes, client) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET 
      purchase_order_status = $1,
      offer_status          = $2,
      offer_notes           = $3,
      num_rejections        = num_rejections + 1
    WHERE id = $4
    RETURNING *;
  `;
  const vals = ["Rejected", "Rejected", offerNotes, orderId];
  const { rows } = await query(sql, vals, client);
  return rows[0];
}

export async function cancelOrderById(orderId, client) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET
      purchase_order_status = $1,
      spots_locked = FALSE,
      offer_status = $2
    WHERE id = $3
    RETURNING *;
  `;
  const vals = ["Cancelled", "Cancelled", orderId];
  const { rows } = await query(sql, vals, client);
  return rows[0];
}

export async function clearOrderMetals(orderId, client) {
  const sql = `
    UPDATE exchange.order_metals
    SET bid_spot = NULL
    WHERE purchase_order_id = $1;
  `;
  return query(sql, [orderId], client);
}

export async function updateOfferNotes(order, offer_notes, executor) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET offer_notes = $1
    WHERE id = $2
    RETURNING *;
  `;
  const values = [offer_notes, order.id];
  const { rows } = await query(sql, values, executor);

  return rows[0];
}

export async function createReview({ order }, executor) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET review_created = true
    WHERE id = $1
    RETURNING *;
  `;
  const values = [order.id];
  const { rows } = await query(sql, values, executor);
  return rows[0];
}

export async function insertOrder(client, { userId, addressId, status }) {
  const sql = `
    INSERT INTO exchange.purchase_orders (user_id, address_id, purchase_order_status)
    VALUES ($1, $2, $3)
    RETURNING id;
  `;
  const { rows } = await query(sql, [userId, addressId, status], client);
  return rows[0].id;
}

export async function insertItems(client, orderId, items) {
  const sql = `
    INSERT INTO exchange.purchase_order_items
      (purchase_order_id, scrap_id, product_id, quantity, premium)
    VALUES
      ($1,$2,$3,$4,$5)
  `;

  for (const { type, data } of items) {
    await query(sql, [
      orderId,
      type === "scrap" ? data.id : null,
      type === "product" ? data.id : null,
      data.quantity ?? 1,
      data.bid_premium ?? 0.75,
    ], client);
  }
}

export async function insertOrderMetals(
  client,
  orderId,
  metals = ["Gold", "Silver", "Platinum", "Palladium"]
) {
  const sql = `
    INSERT INTO exchange.order_metals (purchase_order_id, type)
    VALUES ($1, $2)
  `;
  for (const metal of metals) {
    await query(sql, [orderId, metal], client);
  }
}

export async function insertPayout(client, orderId, payout) {
  const sql = `
    INSERT INTO exchange.payouts (
      user_id,
      order_id,
      method,
      account_holder_name,
      bank_name,
      account_type,
      routing_number,
      account_number,
      email_to,
      cost
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;
  const vals = [
    payout.userId,
    orderId,
    payout.method,
    payout.account_holder_name,
    payout.bank_name || null,
    payout.account_type || null,
    payout.routing_number || null,
    payout.account_number || null,
    payout.payout_email || null,
    payout.cost || 0,
  ];
  await query(sql, vals, client);
}

export async function clearItemPrices(client, orderId) {
  const sql = `
    UPDATE exchange.purchase_order_items
      SET price = NULL
    WHERE purchase_order_id = $1;
  `;
  return query(sql, [orderId], client);
}

export async function resetOrderTotal(client, orderId) {
  const sql = `
    UPDATE exchange.purchase_orders
      SET total_price = NULL
    WHERE id = $1;
  `;
  return query(sql, [orderId], client);
}

export async function updateOffer(
  client,
  { orderId, sentAt, expiresAt, offerStatus, updated_by }
) {
  const sql = `
    UPDATE exchange.purchase_orders
      SET
        offer_status = $1,
        offer_sent_at = $2,
        offer_expires_at = $3,
        updated_by = $4,
        updated_at = NOW()
    WHERE id = $5
    RETURNING *;
  `;
  const values = [offerStatus, sentAt, expiresAt, updated_by, orderId];
  const { rows } = await query(sql, values, client);
  return rows[0];
}

export async function updateStatus(order, order_status, user_name, executor) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET
      purchase_order_status = $1,
      updated_at = NOW(),
      updated_by = $2
    WHERE id = $3
    RETURNING *;
  `;

  const values = [order_status, user_name, order.id];
  const { rows } = await query(sql, values, executor);
  return rows[0];
}

export async function toggleSpots(locked, order_id, client) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET spots_locked = $1
    WHERE id = $2
  `;
  const values = [locked, order_id];
  return await query(sql, values, client);
}

export async function updateSpot({ spot, updated_spot }, executor) {
  const sql = `
    UPDATE exchange.order_metals
    SET bid_spot = $1 
    WHERE purchase_order_id = $2
    AND type = $3
    RETURNING *;
  `;
  const values = [updated_spot, spot.purchase_order_id, spot.type];
  return await query(sql, values, executor);
}

export async function toggleOrderItemStatus({ item_status, ids, purchase_order_id }, executor) {
  const sql = `
    UPDATE exchange.purchase_order_items
    SET confirmed = $1
    WHERE purchase_order_id = $2
      AND id = ANY($3::uuid[])
    RETURNING *;
  `;
  const values = [item_status, purchase_order_id, ids];
  return await query(sql, values, executor);
}

export async function deleteOrderItems(ids, executor) {
  const sql = `
    DELETE FROM exchange.purchase_order_items
    WHERE id = ANY($1::uuid[])
    RETURNING *;
  `;
  const values = [ids];
  return await query(sql, values, executor);
}

export async function createOrderItem(item, purchase_order_id, scrap_id, client) {
  const sql = `
    INSERT INTO exchange.purchase_order_items (
      purchase_order_id, scrap_id, product_id, quantity, confirmed
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const values = [purchase_order_id, scrap_id, item?.id ?? null, 1, false];
  return await query(sql, values, client);
}

export async function updateBullion(item, executor) {
  const sql = `
    UPDATE exchange.purchase_order_items
    SET quantity = $1, premium = $2
    WHERE id = $3
    RETURNING *;
  `;

  const values = [item.quantity, item.premium, item.id];
  return await query(sql, values, executor);
}

export async function findExpiredOffers() {
  const sql = `
    SELECT * FROM exchange.purchase_orders
    WHERE offer_status = 'Sent'
      AND offer_expires_at IS NOT NULL
      AND offer_expires_at < NOW();
  `;
  const { rows } = await query(sql);
  return rows;
}

export async function getCurrentSpotPrices(client) {
  const { rows } = await query(
    `
    SELECT type, bid_spot FROM exchange.metals;
  `,
    [],
    client
  );
  return rows;
}

export async function editShippingCharge(order_id, shipping_charge, executor) {
  const sql = `
  UPDATE exchange.shipments
  SET net_charge = $1
  WHERE purchase_order_id = $2
  RETURNING *;
  `;
  const values = [shipping_charge, order_id];
  return await query(sql, values, executor);
}

export async function editPayoutCharge(order_id, shipping_charge, executor) {
  const sql = `
  UPDATE exchange.payouts
  SET cost = $1
  WHERE order_id = $2
  RETURNING *;
  `;
  const values = [shipping_charge, order_id];
  return await query(sql, values, executor);
}

export async function changePayoutMethod(order_id, method) {
  const sql = `
  UPDATE exchange.payouts
  SET method = $1
  WHERE order_id = $2
  RETURNING *;
  `;
  const values = [method, order_id];
  return await query(sql, values);
}

export async function purgeCancelled() {
  const sql = `
    DELETE FROM exchange.purchase_orders
    WHERE purchase_order_status = 'Cancelled'
  `
  return await query(sql, [])
}

export async function updateRefinerMetals(orderId, spotPrices, client) {
  const updates = await Promise.all(
    spotPrices.map(async (spot) => {
      const sql = `
        UPDATE exchange.refiner_metals
        SET bid_spot = $1
        WHERE purchase_order_id = $2
        AND type = $3
        RETURNING *;
      `;
      const vals = [spot.bid_spot, orderId, spot.type];
      const { rows } = await query(sql, vals, client);
      return rows[0];
    })
  );
  return updates;
}

export async function findRefinerMetalsByOrderId(orderId) {
  const sql = `
    SELECT 
      id,
      purchase_order_id,
      type,
      ask_spot,
      bid_spot,
      percent_change,
      dollar_change,
      created_at,
      updated_at
    FROM exchange.refiner_metals
    WHERE purchase_order_id = $1
    ORDER BY type ASC, id ASC;
  `;
  const { rows } = await query(sql, [orderId]);
  return rows;
}

export async function insertRefinerMetals(
  client,
  orderId,
  metals = ["Gold", "Silver", "Platinum", "Palladium"]
) {
  const sql = `
    INSERT INTO exchange.refiner_metals (purchase_order_id, type)
    VALUES ($1, $2)
  `;
  for (const metal of metals) {
    await query(sql, [orderId, metal], client);
  }
}

export async function updateRefinerSpot({ spot, updated_spot }) {

  const sql = `
    UPDATE exchange.refiner_metals
    SET bid_spot = $1 
    WHERE purchase_order_id = $2
    AND type = $3
    RETURNING *;
  `;
  const values = [updated_spot, spot.purchase_order_id, spot.type];
  return await query(sql, values);
}

export async function updatePremium(item_id, premium, executor) {
  const sql = `
    UPDATE exchange.purchase_order_items
    SET premium = $1
    WHERE id = $2
  `;
  const values = [premium, item_id];
  return await query(sql, values, executor);
}

// Scrap line items on an order with the metal + estimated content needed to
// re-tier their premiums from the rates table.
export async function findOrderScrapItems(orderId, executor) {
  const sql = `
    SELECT poi.id, ms.type AS metal, s.content
    FROM exchange.purchase_order_items poi
    JOIN exchange.scrap s ON poi.scrap_id = s.id
    JOIN exchange.metals ms ON s.metal_id = ms.id
    WHERE poi.purchase_order_id = $1
  `;
  const { rows } = await query(sql, [orderId], executor);
  return rows;
}

export async function updateRefinerPremium(item_id, refiner_premium, executor) {
  const sql = `
    UPDATE exchange.purchase_order_items
    SET refiner_premium = $1
    WHERE id = $2
  `;
  const values = [refiner_premium, item_id];
  return await query(sql, values, executor);
}

export async function updateShippingActual(purchase_order_id, shipping_fee_actual, executor) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET shipping_fee_actual = $1
    WHERE id = $2
  `;
  const values = [shipping_fee_actual, purchase_order_id];
  return await query(sql, values, executor);
}

export async function updateRefinerFee(purchase_order_id, refiner_fee, executor) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET refiner_fee = $1
    WHERE id = $2
  `;
  const values = [refiner_fee, purchase_order_id];
  return await query(sql, values, executor);
}

export async function updatePoolOzDeducted(purchase_order_id, pool_oz_deducted, executor) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET pool_oz_deducted = $1
    WHERE id = $2
  `;
  const values = [pool_oz_deducted, purchase_order_id];
  return await query(sql, values, executor);
}

export async function updatePoolRemediation(purchase_order_id, pool_remediation, executor) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET pool_remediation = $1
    WHERE id = $2
  `;
  const values = [pool_remediation, purchase_order_id];
  return await query(sql, values, executor);
}
// Full bank details for a single payout. Deliberately separate from the order
// queries so the numbers are fetched deliberately, one order at a time, by an
// admin executing a transfer - rather than riding along with every order list.
export async function findPayoutDetails(order_id, executor) {
  const sql = `
    SELECT id, order_id, method, account_holder_name, bank_name,
           account_type, routing_number, account_number, email_to
    FROM exchange.payouts
    WHERE order_id = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [order_id], executor);
  return rows[0] ?? null;
}
