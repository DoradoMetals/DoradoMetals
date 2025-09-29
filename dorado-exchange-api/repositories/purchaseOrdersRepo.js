import pool from '../db.js';
import { calculateItemPrice } from '../utils/price-calculations.js';

export async function findAllByUser(userId) {
  const query = `
    SELECT 
      po.*,
      json_agg(DISTINCT jsonb_build_object(
        'id', poi.id,
        'purchase_order_id', poi.purchase_order_id,
        'price', poi.price,
        'quantity', poi.quantity,
        'confirmed', poi.confirmed,
        'premium', poi.premium,
        'item_type', CASE 
          WHEN poi.scrap_id IS NOT NULL THEN 'scrap'
          WHEN poi.product_id IS NOT NULL THEN 'product'
          ELSE 'unknown'
        END,
        'scrap', jsonb_build_object(
          'id', s.id,
          'pre_melt', s.pre_melt,
          'post_melt', s.post_melt,
          'purity', s.purity,
          'content', s.content,
          'gross_unit', s.gross_unit,
          'metal', ms.type
        ),
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
      ) AS shipment,
      jsonb_build_object(
        'id', ret.id,
        'purchase_order_id', ret.purchase_order_id,
        'sales_order_id', ret.sales_order_id,
        'tracking_number', ret.tracking_number,
        'shipping_status', ret.shipping_status,
        'estimated_delivery', ret.estimated_delivery,
        'shipped_at', ret.shipped_at,
        'delivered_at', ret.delivered_at,
        'created_at', ret.created_at,
        'label_type', ret.label_type,
        'pickup_type', ret.pickup_type,
        'package', ret.package,
        'shipping_label', encode(ret.shipping_label, 'base64'),
        'shipping_charge', ret.net_charge,
        'shipping_service', ret.service_type,
        'insured', ret.insured,
        'declared_value', ret.declared_value,
        'type', ret.type,
        'carrier_id', ret.carrier_id
      ) AS return_shipment,
      to_jsonb(cp) AS carrier_pickup,
      to_jsonb(pay) AS payout,
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
    LEFT JOIN exchange.shipments ret ON ret.purchase_order_id = po.id AND ship.type = 'Return'
    LEFT JOIN exchange.carrier_pickups cp ON cp.order_id = po.id
    LEFT JOIN exchange.payouts pay ON pay.order_id = po.id
    LEFT JOIN exchange.users u ON u.id = po.user_id
    WHERE po.user_id = $1
    GROUP BY po.id, addr.id, ship.id, ret.id, cp.id, pay.id, u.id
    ORDER BY po.created_at DESC;
  `;
  const { rows } = await pool.query(query, [userId]);
  return rows;
}

export async function findById(id) {
  const query = `
    SELECT 
      po.*,
      json_agg(DISTINCT jsonb_build_object(
        'id', poi.id,
        'purchase_order_id', poi.purchase_order_id,
        'price', poi.price,
        'quantity', poi.quantity,
        'confirmed', poi.confirmed,
        'premium', poi.premium,
        'item_type', CASE 
          WHEN poi.scrap_id IS NOT NULL THEN 'scrap'
          WHEN poi.product_id IS NOT NULL THEN 'product'
          ELSE 'unknown'
        END,
        'scrap', jsonb_build_object(
          'id', s.id,
          'pre_melt', s.pre_melt,
          'post_melt', s.post_melt,
          'purity', s.purity,
          'content', s.content,
          'gross_unit', s.gross_unit,
          'metal', ms.type
        ),
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
      ) AS shipment,
      jsonb_build_object(
        'id', ret.id,
        'purchase_order_id', ret.purchase_order_id,
        'sales_order_id', ret.sales_order_id,
        'tracking_number', ret.tracking_number,
        'shipping_status', ret.shipping_status,
        'estimated_delivery', ret.estimated_delivery,
        'shipped_at', ret.shipped_at,
        'delivered_at', ret.delivered_at,
        'created_at', ret.created_at,
        'label_type', ret.label_type,
        'pickup_type', ret.pickup_type,
        'package', ret.package,
        'shipping_label', encode(ret.shipping_label, 'base64'),
        'shipping_charge', ret.net_charge,
        'shipping_service', ret.service_type,
        'insured', ret.insured,
        'declared_value', ret.declared_value,
        'type', ret.type,
        'carrier_id', ret.carrier_id
      ) AS return_shipment,
      to_jsonb(cp) AS carrier_pickup,
      to_jsonb(pay) AS payout,
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
    LEFT JOIN exchange.shipments ret ON ret.purchase_order_id = po.id AND ship.type = 'Return'
    LEFT JOIN exchange.carrier_pickups cp ON cp.order_id = po.id
    LEFT JOIN exchange.payouts pay ON pay.order_id = po.id
    LEFT JOIN exchange.users u ON u.id = po.user_id
    WHERE po.id = $1
    GROUP BY po.id, addr.id, ship.id, ret.id, cp.id, pay.id, u.id
    ORDER BY po.created_at DESC
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [id]);
  return rows[0] || null;
}

export async function getAll() {
  const query = `
      SELECT 
        po.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', poi.id,
          'purchase_order_id', poi.purchase_order_id,
          'price', poi.price,
          'quantity', poi.quantity,
          'confirmed', poi.confirmed,
          'premium', poi.premium,
          'item_type', CASE 
            WHEN poi.scrap_id IS NOT NULL THEN 'scrap'
            WHEN poi.product_id IS NOT NULL THEN 'product'
            ELSE 'unknown'
          END,
          'scrap', jsonb_build_object(
            'id', s.id,
            'pre_melt', s.pre_melt,
            'post_melt', s.post_melt,
            'purity', s.purity,
            'content', s.content,
            'gross_unit', s.gross_unit,
            'metal', ms.type
          ),
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
      ) AS shipment,
      jsonb_build_object(
        'id', ret.id,
        'purchase_order_id', ret.purchase_order_id,
        'sales_order_id', ret.sales_order_id,
        'tracking_number', ret.tracking_number,
        'shipping_status', ret.shipping_status,
        'estimated_delivery', ret.estimated_delivery,
        'shipped_at', ret.shipped_at,
        'delivered_at', ret.delivered_at,
        'created_at', ret.created_at,
        'label_type', ret.label_type,
        'pickup_type', ret.pickup_type,
        'package', ret.package,
        'shipping_label', encode(ret.shipping_label, 'base64'),
        'shipping_charge', ret.net_charge,
        'shipping_service', ret.service_type,
        'insured', ret.insured,
        'declared_value', ret.declared_value,
        'type', ret.type,
        'carrier_id', ret.carrier_id
      ) AS return_shipment,
      to_jsonb(cp) AS carrier_pickup,
      to_jsonb(pay) AS payout,
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
    LEFT JOIN exchange.shipments ret ON ret.purchase_order_id = po.id AND ship.type = 'Return'
      LEFT JOIN exchange.carrier_pickups cp ON cp.order_id = po.id
      LEFT JOIN exchange.payouts pay ON pay.order_id = po.id
      LEFT JOIN exchange.users u ON u.id = po.user_id
      GROUP BY po.id, addr.id, ship.id, ret.id, cp.id, pay.id, u.id
      ORDER BY po.created_at DESC;
    `;

  const { rows } = await pool.query(query, []);
  return rows;
}

export async function findMetalsByOrderId(orderId) {
  const query = `
    SELECT 
      id,
      purchase_order_id,
      type,
      ask_spot,
      bid_spot,
      percent_change,
      dollar_change,
      scrap_percentage,
      created_at,
      updated_at
    FROM exchange.order_metals
    WHERE purchase_order_id = $1
    ORDER BY type ASC;
  `;
  const { rows } = await pool.query(query, [orderId]);
  return rows;
}

export async function updateOrderMetals(orderId, spotPrices, client) {
  const updates = await Promise.all(
    spotPrices.map(async (spot) => {
      const query = `
        UPDATE exchange.order_metals
        SET bid_spot = $1,
            scrap_percentage = $2
        WHERE purchase_order_id = $3
        AND type = $4
        RETURNING *;
      `;
      const vals = [spot.bid_spot, spot.scrap_percentage, orderId, spot.type];
      const { rows } = await client.query(query, vals);
      return rows[0];
    })
  );
  return updates;
}

export async function updateOrderItemPrices(orderId, items, spotRows, client) {
  await Promise.all(
    items.map((item) => {
      const price = calculateItemPrice(item, spotRows);
      const query = `
        UPDATE exchange.purchase_order_items
        SET price = $1
        WHERE id = $2
        AND purchase_order_id = $3;
      `;
      return client.query(query, [price, item.id, orderId]);
    })
  );
}

export async function moveOrderToAccepted(orderId, totalPrice, client) {
  const query = `
    UPDATE exchange.purchase_orders
    SET offer_status = $1,
        purchase_order_status = $2,
        total_price = $3,
        spots_locked = TRUE
    WHERE id = $4;
  `;
  await client.query(query, ["Accepted", "Accepted", totalPrice, orderId]);
}

export async function rejectOfferById(orderId, offerNotes, client) {
  const query = `
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
  const { rows } = await client.query(query, vals);
  return rows[0];
}

export async function cancelOrderById(orderId, client) {
  const query = `
    UPDATE exchange.purchase_orders
    SET
      purchase_order_status = $1,
      spots_locked = FALSE,
      offer_status = $2
    WHERE id = $3
    RETURNING *;
  `;
  const vals = ["Cancelled", "Cancelled", orderId];
  const { rows } = await client.query(query, vals);
  return rows[0];
}

export async function clearOrderMetals(orderId, client) {
  const query = `
    UPDATE exchange.order_metals
    SET bid_spot = NULL, scrap_percentage = NULL
    WHERE purchase_order_id = $1;
  `;
  return client.query(query, [orderId]);
}

export async function insertReturnShipment(
  client,
  orderId,
  shipment,
  labelBuffer,
) {
  const query = `
    INSERT INTO exchange.return_shipments (
      order_id,
      tracking_number,
      carrier,
      shipping_status,
      shipping_label,
      label_type,
      pickup_type,
      package,
      service_type,
      net_charge,
      insured,
      declared_value
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    RETURNING *;
  `;
  const vals = [
    orderId,
    shipment.tracking_number,
    "FedEx",
    "Label Created",
    labelBuffer,
    "Generated",
    shipment.pickup?.label || "DROPOFF_AT_FEDEX_LOCATION",
    shipment.package.dimensions,
    shipment.service?.serviceDescription || "Express Saver",
    shipment.service.netCharge,
    shipment.insurance.insured,
    shipment.insurance.declaredValue.amount,
  ];
  const { rows } = await client.query(query, vals);
  return rows[0];
}

export async function updateOfferNotes(order, offer_notes) {
  const query = `
    UPDATE exchange.purchase_orders
    SET offer_notes = $1
    WHERE id = $2
    RETURNING *;
  `;
  const values = [offer_notes, order.id];
  const { rows } = await pool.query(query, values);

  return rows[0];
}

export async function createReview(order) {
  const query = `
    UPDATE exchange.purchase_orders
    SET review_created = true
    WHERE id = $1
    RETURNING *;
  `;
  const values = [order.id];
  const { rows } = await pool.query(query, values);

  return rows[0];
}

export async function insertOrder(client, { userId, addressId, status }) {
  const query = `
    INSERT INTO exchange.purchase_orders (user_id, address_id, purchase_order_status)
    VALUES ($1, $2, $3)
    RETURNING id;
  `;
  const { rows } = await client.query(query, [userId, addressId, status]);
  return rows[0].id;
}

export async function insertItems(client, orderId, items) {
  const query = `
    INSERT INTO exchange.purchase_order_items
      (purchase_order_id, scrap_id, product_id, quantity, premium)
    VALUES
      ($1,$2,$3,$4,$5)
  `;

  //TODO: is bid_premium right..?
  for (const { type, data } of items) {
    await client.query(query, [
      orderId,
      type === "scrap" ? data.id : null,
      type === "product" ? data.id : null,
      data.quantity,
      data.bid_premium ?? null,
    ]);
  }
}

export async function insertOrderMetals(
  client,
  orderId,
  metals = ["Gold", "Silver", "Platinum", "Palladium"]
) {
  const query = `
    INSERT INTO exchange.order_metals (purchase_order_id, type)
    VALUES ($1, $2)
  `;
  for (const metal of metals) {
    await client.query(query, [orderId, metal]);
  }
}

export async function insertPayout(client, orderId, payout) {
  const query = `
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
  await client.query(query, vals);
}

export async function clearItemPrices(client, orderId) {
  const query = `
    UPDATE exchange.purchase_order_items
      SET price = NULL
    WHERE purchase_order_id = $1;
  `;
  return client.query(query, [orderId]);
}

export async function resetOrderTotal(client, orderId) {
  const query = `
    UPDATE exchange.purchase_orders
      SET total_price = NULL
    WHERE id = $1;
  `;
  return client.query(query, [orderId]);
}

export async function updateOffer(
  client,
  { orderId, sentAt, expiresAt, offerStatus, updated_by }
) {
  const query = `
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
  const { rows } = await client.query(query, values);
  return rows[0];
}

export async function updateStatus(order, order_status, user_name) {
  const query = `
    UPDATE exchange.purchase_orders
    SET
      purchase_order_status = $1,
      updated_at = NOW(),
      updated_by = $2
    WHERE id = $3
    RETURNING *;
  `;

  const values = [order_status, user_name, order.id];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

export async function updateScrapPercentage(spot, scrap_percentage) {
  const query = `
    UPDATE exchange.order_metals
    SET scrap_percentage = $1
    WHERE purchase_order_id = $2
    AND type = $3
    RETURNING *
  `;
  const values = [scrap_percentage, spot.purchase_order_id, spot.type];
  return await pool.query(query, values);
}

export async function resetScrapPercentage(spot) {
  const query = `
    UPDATE exchange.order_metals om
    SET scrap_percentage = m.scrap_percentage
    FROM exchange.metals m
    WHERE om.purchase_order_id = $1
      AND om.type = m.type
      AND om.type = $2
    RETURNING om.*;
  `;
  const values = [spot.purchase_order_id, spot.type];
  return await pool.query(query, values);
}

export async function toggleSpots(locked, order_id, client) {
  const query = `
    UPDATE exchange.purchase_orders
    SET spots_locked = $1
    WHERE id = $2
  `;
  const values = [locked, order_id];
  return await client.query(query, values);
}

export async function updateSpot({ spot, updated_spot }) {
  const query = `
    UPDATE exchange.order_metals
    SET bid_spot = $1 
    WHERE purchase_order_id = $2
    AND type = $3
    RETURNING *;
  `;
  const values = [updated_spot, spot.purchase_order_id, spot.type];
  return await pool.query(query, values);
}

export async function toggleOrderItemStatus({ item_status, ids, purchase_order_id }) {
  const query = `
    UPDATE exchange.purchase_order_items
    SET confirmed = $1
    WHERE purchase_order_id = $2
      AND id = ANY($3::uuid[])
    RETURNING *;
  `;
  const values = [item_status, purchase_order_id, ids];
  return await pool.query(query, values);
}

export async function deleteOrderItems(ids) {
  const query = `
    DELETE FROM exchange.purchase_order_items
    WHERE id = ANY($1::uuid[])
    RETURNING *;
  `;
  const values = [ids];
  return await pool.query(query, values);
}

export async function createOrderItem(item, purchase_order_id, scrap_id, client) {
  const query = `
    INSERT INTO exchange.purchase_order_items (
      purchase_order_id, scrap_id, product_id, quantity, confirmed
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const values = [purchase_order_id, scrap_id, item?.id ?? null, 1, false];
  return await client.query(query, values);
}

export async function updateBullion(item) {
  const query = `
    UPDATE exchange.purchase_order_items
    SET quantity = $1, premium = $2
    WHERE id = $3
    RETURNING *;
  `;

  const values = [item.quantity, item.premium, item.id];
  return await pool.query(query, values);
}

export async function findExpiredOffers() {
  const query = `
    SELECT * FROM exchange.purchase_orders
    WHERE offer_status = 'Sent'
      AND offer_expires_at IS NOT NULL
      AND offer_expires_at < NOW();
  `;
  const { rows } = await pool.query(query);
  return rows;
}

export async function getCurrentSpotPrices(client) {
  const { rows } = await client.query(`
    SELECT type, bid_spot FROM exchange.metals;
  `);
  return rows;
}

export async function editShippingCharge(order_id, shipping_charge) {
  const query = `
  UPDATE exchange.shipments
  SET net_charge = $1
  WHERE purchase_order_id = $2
  RETURNING *;
  `;
  const values = [shipping_charge, order_id];
  return await pool.query(query, values);
}

export async function editPayoutCharge(order_id, shipping_charge) {
  const query = `
  UPDATE exchange.payouts
  SET cost = $1
  WHERE order_id = $2
  RETURNING *;
  `;
  const values = [shipping_charge, order_id];
  return await pool.query(query, values);
}

export async function changePayoutMethod(order_id, method) {
  const query = `
  UPDATE exchange.payouts
  SET method = $1
  WHERE order_id = $2
  RETURNING *;
  `;
  const values = [method, order_id];
  return await pool.query(query, values);
}

export async function purgeCancelled() {
  const query = `
    DELETE FROM exchange.purchase_orders
    WHERE purchase_order_status = 'Cancelled'
  `
  return await pool.query(query, [])
}

export async function updateRefinerMetals(orderId, spotPrices, client) {
  const updates = await Promise.all(
    spotPrices.map(async (spot) => {
      const query = `
        UPDATE exchange.refiner_metals
        SET bid_spot = $1,
            scrap_percentage = $2
        WHERE purchase_order_id = $3
        AND type = $4
        RETURNING *;
      `;
      const vals = [spot.bid_spot, spot.scrap_percentage, orderId, spot.type];
      const { rows } = await client.query(query, vals);
      return rows[0];
    })
  );
  return updates;
}

export async function findRefinerMetalsByOrderId(orderId) {
  const query = `
    SELECT 
      id,
      purchase_order_id,
      type,
      ask_spot,
      bid_spot,
      percent_change,
      dollar_change,
      scrap_percentage,
      created_at,
      updated_at
    FROM exchange.refiner_metals
    WHERE purchase_order_id = $1
    ORDER BY type ASC;
  `;
  const { rows } = await pool.query(query, [orderId]);
  return rows;
}

export async function insertRefinerMetals(
  client,
  orderId,
  metals = ["Gold", "Silver", "Platinum", "Palladium"]
) {
  const query = `
    INSERT INTO exchange.refiner_metals (purchase_order_id, type)
    VALUES ($1, $2)
  `;
  for (const metal of metals) {
    await client.query(query, [orderId, metal]);
  }
}

export async function updateRefinerScrapPercentage(spot, scrap_percentage) {
      console.log('scrap: ', spot)

  const query = `
    UPDATE exchange.refiner_metals
    SET scrap_percentage = $1
    WHERE purchase_order_id = $2
    AND type = $3
    RETURNING *
  `;
  const values = [scrap_percentage, spot.purchase_order_id, spot.type];
  return await pool.query(query, values);
}

export async function resetRefinerScrapPercentage(spot) {

  const query = `
    UPDATE exchange.refiner_metals om
    SET scrap_percentage = m.scrap_percentage
    FROM exchange.metals m
    WHERE om.purchase_order_id = $1
      AND om.type = m.type
      AND om.type = $2
    RETURNING om.*;
  `;
  const values = [spot.purchase_order_id, spot.type];
  return await pool.query(query, values);
}

export async function updateRefinerSpot({ spot, updated_spot }) {

  console.log('spot: ', spot)
  const query = `
    UPDATE exchange.refiner_metals
    SET bid_spot = $1 
    WHERE purchase_order_id = $2
    AND type = $3
    RETURNING *;
  `;
  const values = [updated_spot, spot.purchase_order_id, spot.type];
  return await pool.query(query, values);
}