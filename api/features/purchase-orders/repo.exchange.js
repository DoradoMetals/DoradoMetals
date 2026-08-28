// Purchase orders read from the legacy exchange schema.
//
// See repo.js for how this and repo.next.js are selected between.
import query from "#shared/db/query.js";
import { calculateItemPrice } from '#features/purchase-orders/utils/calculations.ts';

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

// THE NEXT WIRE, DERIVED FROM THE FLAT ROW (D84). Orders never had a *_WIRE
// switch, so both read implementations serve the SAME converted shape and
// PURCHASE_ORDERS_SOURCE goes on selecting between them. The renames are the
// schema's own: order_number -> number, purchase_order_status -> status, the
// money nested as `totals` under orders.transactions' names, the address as a
// snapshot (recipient_name says what the smeared `name` meant on an order),
// and the item's product speaking name/description/type.
//
// po.* is gone: an explicit list, so a column appearing on one side and not
// the other is a conflict rather than a silent change, and so the column
// order matches repo.next.ts exactly - `diff` serialises rows to compare
// them, and a reordering reads as a divergence.
//
// The totals exchange never stored for a purchase order - items, shipping,
// surcharge, sales_tax, funds, base_total, subject/post charges - are
// projected NULL: OrderTotals declares every key and a purchase order
// simply has no value for the sale-side ones. repo.next.ts reads them off
// orders.transactions, where every purchase row holds NULL for the same
// columns (checked in dev: 0 of 40), so the two implementations agree.
function buildOrderQuery({ where = "", limit = "", withActuals = false } = {}) {
  return `
    SELECT
      po.id,
      po.user_id,
      po.address_id,
      po.purchase_order_status AS status,
      po.notes,
      po.created_at,
      po.updated_at,
      po.created_by,
      po.updated_by,
      po.order_number AS number,
      po.spots_locked,
      po.waive_shipping_fee,
      po.waive_payout_fee,
      po.shipping_paid,
      po.review_created,
      po.shipping_fee_actual,
      po.pool_remediation,
      po.pool_oz_deducted,
      jsonb_build_object(
        'total', po.total_price,
        'items', NULL,
        'shipping', NULL,
        'surcharge', NULL,
        'sales_tax', NULL,
        'funds', NULL,
        'refiner_fee', po.refiner_fee,
        'base_total', NULL,
        'subject_to_charges_amount', NULL,
        'post_charges_amount', NULL
      ) AS totals,
      -- FILTER + COALESCE, same fix as repo.next.ts: an itemless order gets []
      -- rather than one all-null object that the item_type CASE labels a scrap
      -- line (D53). Five production-era dev orders are in that state.
      COALESCE(json_agg(DISTINCT jsonb_build_object(
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
          'name', p.product_name,
          'description', p.product_description,
          'type', p.product_type,
          'metal_type', mp.type,
          'content', p.content,
          'gross', p.gross,
          'purity', p.purity,
          'bid_premium', p.bid_premium,
          'ask_premium', p.ask_premium,
          'image_front', p.image_front,
          'image_back', p.image_back,
          'mint_name', pm.name
        )
      )) FILTER (WHERE poi.id IS NOT NULL), '[]'::json) AS order_items,
      -- THE SNAPSHOT SHAPE, NOT THE BOOK ROW. address_id is the BOOK id -
      -- checkout posts it back and resolves it against exchange.addresses -
      -- and recipient_name is what the book's smeared name column always meant on an
      -- order: who receives the shipment. No user_id, no is_default, no
      -- timestamps: a snapshot is neither a place nor a relationship.
      -- CASE, not jsonb_build_object bare: to_jsonb(addr) was NULL when the
      -- join missed, and "no address" must stay null rather than becoming an
      -- object of nulls.
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
      jsonb_build_object(
        'user_id', u.id,
        'user_name', u.name,
        'user_email', u.email
      ) AS "user"
    FROM exchange.purchase_orders po
    LEFT JOIN exchange.purchase_order_items poi ON poi.purchase_order_id = po.id
    LEFT JOIN exchange.scrap s ON poi.scrap_id = s.id
    LEFT JOIN exchange.products p ON poi.product_id = p.id
    LEFT JOIN exchange.mints pm ON pm.id = p.mint_id
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
      type AS name,
      ask_spot AS ask,
      bid_spot AS bid,
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

export async function findRefinerMetalsByOrderId(orderId) {
  const sql = `
    SELECT 
      id,
      purchase_order_id,
      type AS name,
      ask_spot AS ask,
      bid_spot AS bid,
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
