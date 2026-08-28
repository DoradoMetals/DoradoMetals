// The exchange half of the purchase-order WRITES. THIS FILE IS SCHEDULED FOR
// DELETION when exchange stops being the recovery copy; until then repo.dual.js
// wraps every function here with its new-schema mirror.
import query from "#shared/db/query.js";
import { calculateItemPrice } from '#features/purchase-orders/utils/calculations.ts';

// THE READ PATHS ARE GONE (ruling 8's read pivot): read.service.ts is THE
// order read, against the new schema, and the covenant - feature data
// verified green before the legacy reads died - was cleared by the wave-1
// parity ledger. What remains here is the exchange half of every dual WRITE,
// which stays for as long as exchange stays the recovery copy.

export async function updateOrderMetals(orderId, spotPrices, client) {
  const updates = await Promise.all(
    spotPrices.map(async (spot) => {
      const sql = `
        UPDATE exchange.order_metals
        SET bid_spot = $1
        WHERE purchase_order_id = $2
        AND type = $3
        RETURNING id, purchase_order_id, sales_order_id,
                  type AS name, ask_spot AS ask, bid_spot AS bid,
                  percent_change, dollar_change, scrap_percentage,
                  bullion_percentage, created_at, updated_at;
      `;
      const vals = [spot.bid, orderId, spot.name];
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

// cancelOrderById IS GONE. It wrote purchase_order_status = 'Cancelled' and
// dropped the spot pin in one statement, and the status half is what killed
// it: statuses are labels now, never side effects (Jacob, 28 August). The
// cancel pipeline unpins through toggleSpots and clears the metals; the
// 'Cancelled' label is the admin's own explicit status write.

export async function clearOrderMetals(orderId, client) {
  const sql = `
    UPDATE exchange.order_metals
    SET bid_spot = NULL
    WHERE purchase_order_id = $1;
  `;
  return query(sql, [orderId], client);
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
    RETURNING id, purchase_order_id, sales_order_id,
                  type AS name, ask_spot AS ask, bid_spot AS bid,
                  percent_change, dollar_change, scrap_percentage,
                  bullion_percentage, created_at, updated_at;
  `;
  const values = [updated_spot, spot.purchase_order_id, spot.name];
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

export async function getCurrentSpotPrices(client) {
  const { rows } = await query(
    `
    SELECT type AS name, bid_spot AS bid FROM exchange.metals;
  `,
    [],
    client
  );
  return rows;
}

// editShippingCharge IS GONE FROM HERE (D41).
//
// It wrote exchange.shipments, a table features/shipping owns and dual-writes.
// The live path is shipping/shipments' setChargeForOrder, called from
// service.ts. Two writers to one table means only one of them dual-writes
// after a pivot, and the column drifts apart between the schemas silently -
// verify:parity does not cover shipments.

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

export async function changePayoutMethod(order_id, method, executor) {
  const sql = `
  UPDATE exchange.payouts
  SET method = $1
  WHERE order_id = $2
  RETURNING *;
  `;
  const values = [method, order_id];
  return await query(sql, values, executor);
}

export async function purgeCancelled(executor) {
  const sql = `
    DELETE FROM exchange.purchase_orders
    WHERE purchase_order_status = 'Cancelled'
  `
  return await query(sql, [], executor)
}

export async function updateRefinerMetals(orderId, spotPrices, client) {
  const updates = await Promise.all(
    spotPrices.map(async (spot) => {
      const sql = `
        UPDATE exchange.refiner_metals
        SET bid_spot = $1
        WHERE purchase_order_id = $2
        AND type = $3
        RETURNING id, purchase_order_id, sales_order_id,
                  type AS name, ask_spot AS ask, bid_spot AS bid,
                  percent_change, dollar_change, scrap_percentage,
                  bullion_percentage, created_at, updated_at;
      `;
      const vals = [spot.bid, orderId, spot.name];
      const { rows } = await query(sql, vals, client);
      return rows[0];
    })
  );
  return updates;
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

export async function updateRefinerSpot({ spot, updated_spot }, executor) {

  const sql = `
    UPDATE exchange.refiner_metals
    SET bid_spot = $1 
    WHERE purchase_order_id = $2
    AND type = $3
    RETURNING id, purchase_order_id, sales_order_id,
                  type AS name, ask_spot AS ask, bid_spot AS bid,
                  percent_change, dollar_change, scrap_percentage,
                  bullion_percentage, created_at, updated_at;
  `;
  const values = [updated_spot, spot.purchase_order_id, spot.name];
  return await query(sql, values, executor);
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

// The order's pricing is finalized: the price agreed and its spots pinned.
//
// This was acceptOrder, which also wrote purchase_order_status = 'Accepted' -
// what moveOrderToAccepted became once offer_status came out of it (086). The
// status write is GONE (Jacob, 28 August: "The stages don't really matter for
// admins... They shouldn't be driving logic AT ALL") - a status is a label an
// admin sets, and pricing is an explicit operation. 'Accepted' itself left the
// lifecycle in migration 092.
export async function recordOrderPricing(orderId, totalPrice, client) {
  const sql = `
    UPDATE exchange.purchase_orders
    SET total_price = $1,
        spots_locked = TRUE
    WHERE id = $2;
  `;
  await query(sql, [totalPrice, orderId], client);
}
