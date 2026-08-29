// THE order writes: exchange first, mirrored into the orders schema, both
// inside one transaction. Since the read pivot (ruling 8) this is no longer a
// phase a switch selects - it is the only write mode, because the dual writes
// are what keep exchange a complete replica while it remains the recovery
// copy. The reads live in read.service.ts.
//
// The mirror re-derives the whole order from exchange rather than applying the
// same change twice. There are 29 writes here and a per-write mirror would be
// 29 chances to map a column wrong; instead each write says which part of the
// order it disturbed - the order, its lines, its spots - and that part is
// rebuilt from what exchange now holds. It is the same INSERT...SELECT the
// backfill uses, so there is one definition of a purchase order in the new
// schema and every write exercises it.
//
// The executor is threaded through every mirror so it joins the caller's
// transaction. If a mirror opened its own connection, a write that later rolled
// back would leave its mirrored row behind - the exact divergence this phase
// exists to prevent.
import withTransaction from "#shared/db/withTransaction.js";
import * as legacyExchange from "#legacy/purchase-orders/repo.exchange.js";
import { calculateItemPrice } from "#features/pricing/service.ts";
import * as mirror from "#features/orders/repo.mirror.ts";

// NO READS HERE ANY MORE. The read pivot (ruling 8) made read.service.ts THE
// order read; what this file holds is the WRITES - exchange and the new
// schema in one transaction, which is what dual-writes staying sacred means.
// getCurrentSpotPrices is not an order read: it is the live metals feed, and
// it stays with the exchange implementation until spots promote.

// THE EXCHANGE HALF ONLY - the new-schema half of these is written by the
// CALLER, not by a mirror here.
//
// This block used to say exchange.payouts was "still the only copy... nothing to
// mirror them into yet", and that had stopped being true: 073 split the payout
// three ways, and 099 added the order link that split was missing. What makes
// them different from every write below is that `sync` cannot do the job -
// mirrorPurchaseOrder rebuilds orders.transactions from
// exchange.purchase_orders, and a payout is not a column of that table. So
// features/orders/service.ts writes payments.details,
// orders.transactions.payout_details_id and orders.transactions.payout_fee
// itself, in the same transaction. See recordPayoutInNewSchema there.
//
// WHAT IS STILL EXCHANGE-ONLY, AND DELIBERATELY: routing_number and
// account_number. Nothing else holds them and nothing else may until encryption
// at rest lands. That is the one reason this file cannot be deleted for payouts.
//
// purgeCancelled is a pass-through with no successor at all, and that is
// Jacob's - see docs/waves/seams.md, seam 3.
//
// exchange.refiner_metals used to be on this list and is not any more: 070
// derives refiners.spots from it, the same way orders.spots is derived from
// order_metals, so the refiner writes below are mirrored like any other.
export const editPayoutCharge = legacyExchange.editPayoutCharge;
export const insertPayout = legacyExchange.insertPayout;
export const changePayoutMethod = legacyExchange.changePayoutMethod;
export const getCurrentSpotPrices = legacyExchange.getCurrentSpotPrices;
export const purgeCancelled = legacyExchange.purgeCancelled;

// Join the caller's transaction if there is one, so the write and its mirror
// stay atomic with whatever else the caller is doing. Every wrapper below takes
// an executor even where the exchange function historically did not: without
// one the mirror opens its own connection and commits, so a caller that later
// rolls back is left with the two schemas disagreeing. That is the failure this
// whole phase exists to prevent, and it is the same wrong-argument-slot mistake
// that took checkout down in August.
const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

// Re-derives the parts of an order named in `parts` after a write to legacyExchange.
//
// THE ORDER IS ALWAYS MIRRORED FIRST, EVEN WHEN THE CALLER ONLY ASKED FOR ITS
// PARTS. orders.items, orders.spots and orders.refiner_spots all carry a
// foreign key to orders.orders, so mirroring a child of an order the new schema
// has never seen raises 23503 and takes the caller's whole transaction down -
// including the write to exchange that had already succeeded.
//
// That is not hypothetical and it is not a dev-only shape. PRODUCTION HOLDS 15
// purchase orders with no orders.orders row, because the backfills have not run
// there yet: 9 Completed, 4 Cancelled, 1 In Transit, 1 Received. With this
// switch on `dual`, editing or deleting a line on any of them answered 500 and
// changed nothing - the exchange write rolled back with the mirror.
//
// Found by running the suite with all eight remaining switches set to `dual`,
// which is the only thing that exercises this path at all: with the switch on
// `exchange` the mirror never runs, so every test passed.
//
// mirrorOrder is an idempotent upsert from exchange, so doing it unconditionally
// costs one statement and cannot be wrong.
const sync = async (c, orderId, parts) => {
  if (!orderId) return;
  await mirror.mirrorPurchaseOrder(orderId, c);
  if (parts.includes("items")) await mirror.mirrorPurchaseItems(orderId, c);
  if (parts.includes("spots")) await mirror.mirrorPurchaseSpots(orderId, c);
  if (parts.includes("refinerSpots")) await mirror.mirrorRefinerSpots(orderId, c);
};

// --------------------------------------------------------- order-level writes

export const createReview = ({ order }, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.createReview({ order }, c);
    await sync(c, order.id, ["order"]);
    return r;
  });

export const updateStatus = (order, order_status, user_name, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updateStatus(order, order_status, user_name, c);
    await sync(c, order.id, ["order"]);
    return r;
  });

export const toggleSpots = (locked, order_id, client) =>
  both(client, async (c) => {
    const r = await legacyExchange.toggleSpots(locked, order_id, c);
    await sync(c, order_id, ["order"]);
    return r;
  });

export const resetOrderTotal = (client, orderId) =>
  both(client, async (c) => {
    const r = await legacyExchange.resetOrderTotal(c, orderId);
    await sync(c, orderId, ["order"]);
    return r;
  });

export const updateShippingActual = (purchase_order_id, shipping_fee_actual, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updateShippingActual(purchase_order_id, shipping_fee_actual, c);
    await sync(c, purchase_order_id, ["order"]);
    return r;
  });

export const updateRefinerFee = (purchase_order_id, refiner_fee, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updateRefinerFee(purchase_order_id, refiner_fee, c);
    await sync(c, purchase_order_id, ["order"]);
    return r;
  });

export const updatePoolOzDeducted = (purchase_order_id, pool_oz_deducted, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updatePoolOzDeducted(purchase_order_id, pool_oz_deducted, c);
    await sync(c, purchase_order_id, ["order"]);
    return r;
  });

export const updatePoolRemediation = (purchase_order_id, pool_remediation, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updatePoolRemediation(purchase_order_id, pool_remediation, c);
    await sync(c, purchase_order_id, ["order"]);
    return r;
  });

// ---------------------------------------------------------------- item writes

// THE PRICE IS COMPUTED HERE, not inside the exchange half. Same function,
// same items, same spot rows, same order - what moved is which side of the
// features/legacy boundary calls it, because legacy/ must not import a
// feature at runtime (lint:legacy-boundary).
export const updateOrderItemPrices = (orderId, items, spotRows, client) =>
  both(client, async (c) => {
    const priced = items.map((item) => ({
      id: item.id,
      price: calculateItemPrice(item, spotRows),
    }));
    const r = await legacyExchange.updateOrderItemPrices(orderId, priced, c);
    await sync(c, orderId, ["items", "order"]);
    return r;
  });

export const clearItemPrices = (client, orderId) =>
  both(client, async (c) => {
    const r = await legacyExchange.clearItemPrices(c, orderId);
    await sync(c, orderId, ["items"]);
    return r;
  });

export const insertItems = (client, orderId, items) =>
  both(client, async (c) => {
    const r = await legacyExchange.insertItems(c, orderId, items);
    await sync(c, orderId, ["items"]);
    return r;
  });

export const createOrderItem = (item, purchase_order_id, scrap_id, client) =>
  both(client, async (c) => {
    const r = await legacyExchange.createOrderItem(item, purchase_order_id, scrap_id, c);
    await sync(c, purchase_order_id, ["items"]);
    return r;
  });

export const toggleOrderItemStatus = (args, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.toggleOrderItemStatus(args, c);
    await sync(c, args.purchase_order_id, ["items"]);
    return r;
  });

// Handed an item id and nothing else, so the order is looked up first.
export const updateBullion = (item, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updateBullion(item, c);
    for (const id of await mirror.orderIdForItems([item.id], c)) await sync(c, id, ["items"]);
    return r;
  });

export const updatePremium = (item_id, premium, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updatePremium(item_id, premium, c);
    for (const id of await mirror.orderIdForItems([item_id], c)) await sync(c, id, ["items"]);
    return r;
  });

export const updateRefinerPremium = (item_id, refiner_premium, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updateRefinerPremium(item_id, refiner_premium, c);
    for (const id of await mirror.orderIdForItems([item_id], c)) await sync(c, id, ["items"]);
    return r;
  });

// The orders have to be found before the delete, not after: once the rows are
// gone from exchange there is nothing left to look them up by, and the mirror
// would leave the deleted lines sitting in the new schema.
export const deleteOrderItems = (ids, executor) =>
  both(executor, async (c) => {
    const orderIds = await mirror.orderIdForItems(ids, c);
    const r = await legacyExchange.deleteOrderItems(ids, c);
    for (const id of orderIds) await sync(c, id, ["items"]);
    return r;
  });

// ---------------------------------------------------------------- spot writes

export const updateOrderMetals = (orderId, spotPrices, client) =>
  both(client, async (c) => {
    const r = await legacyExchange.updateOrderMetals(orderId, spotPrices, c);
    await sync(c, orderId, ["spots"]);
    return r;
  });

export const clearOrderMetals = (orderId, client) =>
  both(client, async (c) => {
    const r = await legacyExchange.clearOrderMetals(orderId, c);
    await sync(c, orderId, ["spots"]);
    return r;
  });

// The refiner's spot for an order. Mirrored the same way, into refiners.spots.
export const updateRefinerMetals = (orderId, spotPrices, client) =>
  both(client, async (c) => {
    const r = await legacyExchange.updateRefinerMetals(orderId, spotPrices, c);
    await sync(c, orderId, ["refinerSpots"]);
    return r;
  });

// Keyed off the spot's own order id, because that is what the caller has.
export const updateRefinerSpot = ({ spot, updated_spot }, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updateRefinerSpot({ spot, updated_spot }, c);
    await sync(c, spot.purchase_order_id, ["refinerSpots"]);
    return r;
  });

// Creates the four metal rows a new order starts with.
export const insertRefinerMetals = (client, orderId, metals) =>
  both(client, async (c) => {
    const r = await legacyExchange.insertRefinerMetals(c, orderId, metals);
    await sync(c, orderId, ["refinerSpots"]);
    return r;
  });

export const insertOrderMetals = (client, orderId, metals) =>
  both(client, async (c) => {
    const r = await legacyExchange.insertOrderMetals(c, orderId, metals);
    await sync(c, orderId, ["spots"]);
    return r;
  });

export const updateSpot = ({ spot, updated_spot }, executor) =>
  both(executor, async (c) => {
    const r = await legacyExchange.updateSpot({ spot, updated_spot }, c);
    await sync(c, spot.purchase_order_id, ["spots"]);
    return r;
  });

// -------------------------------------------------------------------- creation

// The riskiest one, because it is the only write that makes an id. exchange
// generates it and the mirror copies it, so the two schemas agree by
// construction rather than by both calling gen_random_uuid() and hoping.
//
// A new order also needs its address snapshot, which nothing else creates.
export const insertOrder = (client, args) =>
  both(client, async (c) => {
    const id = await legacyExchange.insertOrder(c, args);
    await mirror.mirrorPurchaseOrder(id, c);
    await mirror.mirrorPurchaseAddress(id, c);
    return id;
  });

export const recordOrderPricing = (orderId, totalPrice, client) =>
  both(client, async (c) => {
    const r = await legacyExchange.recordOrderPricing(orderId, totalPrice, c);
    await sync(c, orderId, ["order"]);
    return r;
  });
