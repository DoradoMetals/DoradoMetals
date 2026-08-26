// Dual-write phase of the purchase orders migration.
//
// Every write goes to exchange first and is then mirrored into the orders
// schema, both inside one transaction. Reads come from the new schema, so it is
// exercised by real traffic while exchange stays a complete replica - which is
// what makes the switch reversible. Reading from the new schema while writing
// only there is a one-way door.
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
import * as exchange from "#features/purchase-orders/repo.exchange.js";
import * as next from "#features/purchase-orders/repo.next.ts";

// Reads come from the new schema: exercising it is the point of this phase.
export const findAllByUser = next.findAllByUser;
export const findById = next.findById;
export const getAll = next.getAll;
export const findMetalsByOrderId = next.findMetalsByOrderId;
export const findRefinerMetalsByOrderId = next.findRefinerMetalsByOrderId;
export const findOrderScrapItems = next.findOrderScrapItems;
export const findExpiredOffers = next.findExpiredOffers;

// Writes belonging to features that have not moved. exchange.shipments and
// exchange.payouts are still the only copies of what these touch, so there is
// nothing to mirror them into yet. They move with shipping and payments.
//
// exchange.refiner_metals used to be on this list and is not any more: 070
// derives refiners.spots from it, the same way orders.spots is derived from
// order_metals, so the refiner writes below are mirrored like any other.
export const editShippingCharge = exchange.editShippingCharge;
export const editPayoutCharge = exchange.editPayoutCharge;
export const insertPayout = exchange.insertPayout;
export const changePayoutMethod = exchange.changePayoutMethod;
export const findPayoutDetails = exchange.findPayoutDetails;
export const getCurrentSpotPrices = exchange.getCurrentSpotPrices;
export const purgeCancelled = exchange.purgeCancelled;

// Join the caller's transaction if there is one, so the write and its mirror
// stay atomic with whatever else the caller is doing. Every wrapper below takes
// an executor even where the exchange function historically did not: without
// one the mirror opens its own connection and commits, so a caller that later
// rolls back is left with the two schemas disagreeing. That is the failure this
// whole phase exists to prevent, and it is the same wrong-argument-slot mistake
// that took checkout down in August.
const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

// Re-derives the parts of an order named in `parts` after a write to exchange.
const sync = async (c, orderId, parts) => {
  if (!orderId) return;
  if (parts.includes("order")) await next.mirrorOrder(orderId, c);
  if (parts.includes("items")) await next.mirrorItems(orderId, c);
  if (parts.includes("spots")) await next.mirrorSpots(orderId, c);
  if (parts.includes("refinerSpots")) await next.mirrorRefinerSpots(orderId, c);
};

// --------------------------------------------------------- order-level writes

export const moveOrderToAccepted = (orderId, totalPrice, client) =>
  both(client, async (c) => {
    const r = await exchange.moveOrderToAccepted(orderId, totalPrice, c);
    await sync(c, orderId, ["order"]);
    return r;
  });

export const rejectOfferById = (orderId, offerNotes, client) =>
  both(client, async (c) => {
    const r = await exchange.rejectOfferById(orderId, offerNotes, c);
    await sync(c, orderId, ["order"]);
    return r;
  });

export const cancelOrderById = (orderId, client) =>
  both(client, async (c) => {
    const r = await exchange.cancelOrderById(orderId, c);
    await sync(c, orderId, ["order"]);
    return r;
  });

export const updateOfferNotes = (order, offer_notes, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateOfferNotes(order, offer_notes, c);
    await sync(c, order.id, ["order"]);
    return r;
  });

export const createReview = ({ order }, executor) =>
  both(executor, async (c) => {
    const r = await exchange.createReview({ order }, c);
    await sync(c, order.id, ["order"]);
    return r;
  });

export const updateStatus = (order, order_status, user_name, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateStatus(order, order_status, user_name, c);
    await sync(c, order.id, ["order"]);
    return r;
  });

export const toggleSpots = (locked, order_id, client) =>
  both(client, async (c) => {
    const r = await exchange.toggleSpots(locked, order_id, c);
    await sync(c, order_id, ["order"]);
    return r;
  });

export const updateOffer = (client, args) =>
  both(client, async (c) => {
    const r = await exchange.updateOffer(c, args);
    await sync(c, args.orderId, ["order"]);
    return r;
  });

export const resetOrderTotal = (client, orderId) =>
  both(client, async (c) => {
    const r = await exchange.resetOrderTotal(c, orderId);
    await sync(c, orderId, ["order"]);
    return r;
  });

export const updateShippingActual = (purchase_order_id, shipping_fee_actual, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateShippingActual(purchase_order_id, shipping_fee_actual, c);
    await sync(c, purchase_order_id, ["order"]);
    return r;
  });

export const updateRefinerFee = (purchase_order_id, refiner_fee, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateRefinerFee(purchase_order_id, refiner_fee, c);
    await sync(c, purchase_order_id, ["order"]);
    return r;
  });

export const updatePoolOzDeducted = (purchase_order_id, pool_oz_deducted, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updatePoolOzDeducted(purchase_order_id, pool_oz_deducted, c);
    await sync(c, purchase_order_id, ["order"]);
    return r;
  });

export const updatePoolRemediation = (purchase_order_id, pool_remediation, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updatePoolRemediation(purchase_order_id, pool_remediation, c);
    await sync(c, purchase_order_id, ["order"]);
    return r;
  });

// ---------------------------------------------------------------- item writes

export const updateOrderItemPrices = (orderId, items, spotRows, client) =>
  both(client, async (c) => {
    const r = await exchange.updateOrderItemPrices(orderId, items, spotRows, c);
    await sync(c, orderId, ["items", "order"]);
    return r;
  });

export const clearItemPrices = (client, orderId) =>
  both(client, async (c) => {
    const r = await exchange.clearItemPrices(c, orderId);
    await sync(c, orderId, ["items"]);
    return r;
  });

export const insertItems = (client, orderId, items) =>
  both(client, async (c) => {
    const r = await exchange.insertItems(c, orderId, items);
    await sync(c, orderId, ["items"]);
    return r;
  });

export const createOrderItem = (item, purchase_order_id, scrap_id, client) =>
  both(client, async (c) => {
    const r = await exchange.createOrderItem(item, purchase_order_id, scrap_id, c);
    await sync(c, purchase_order_id, ["items"]);
    return r;
  });

export const toggleOrderItemStatus = (args, executor) =>
  both(executor, async (c) => {
    const r = await exchange.toggleOrderItemStatus(args, c);
    await sync(c, args.purchase_order_id, ["items"]);
    return r;
  });

// Handed an item id and nothing else, so the order is looked up first.
export const updateBullion = (item, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateBullion(item, c);
    for (const id of await next.orderIdForItems([item.id], c)) await sync(c, id, ["items"]);
    return r;
  });

export const updatePremium = (item_id, premium, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updatePremium(item_id, premium, c);
    for (const id of await next.orderIdForItems([item_id], c)) await sync(c, id, ["items"]);
    return r;
  });

export const updateRefinerPremium = (item_id, refiner_premium, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateRefinerPremium(item_id, refiner_premium, c);
    for (const id of await next.orderIdForItems([item_id], c)) await sync(c, id, ["items"]);
    return r;
  });

// The orders have to be found before the delete, not after: once the rows are
// gone from exchange there is nothing left to look them up by, and the mirror
// would leave the deleted lines sitting in the new schema.
export const deleteOrderItems = (ids, executor) =>
  both(executor, async (c) => {
    const orderIds = await next.orderIdForItems(ids, c);
    const r = await exchange.deleteOrderItems(ids, c);
    for (const id of orderIds) await sync(c, id, ["items"]);
    return r;
  });

// ---------------------------------------------------------------- spot writes

export const updateOrderMetals = (orderId, spotPrices, client) =>
  both(client, async (c) => {
    const r = await exchange.updateOrderMetals(orderId, spotPrices, c);
    await sync(c, orderId, ["spots"]);
    return r;
  });

export const clearOrderMetals = (orderId, client) =>
  both(client, async (c) => {
    const r = await exchange.clearOrderMetals(orderId, c);
    await sync(c, orderId, ["spots"]);
    return r;
  });

// The refiner's spot for an order. Mirrored the same way, into refiners.spots.
export const updateRefinerMetals = (orderId, spotPrices, client) =>
  both(client, async (c) => {
    const r = await exchange.updateRefinerMetals(orderId, spotPrices, c);
    await sync(c, orderId, ["refinerSpots"]);
    return r;
  });

// Keyed off the spot's own order id, because that is what the caller has.
export const updateRefinerSpot = ({ spot, updated_spot }, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateRefinerSpot({ spot, updated_spot }, c);
    await sync(c, spot.purchase_order_id, ["refinerSpots"]);
    return r;
  });

// Creates the four metal rows a new order starts with.
export const insertRefinerMetals = (client, orderId, metals) =>
  both(client, async (c) => {
    const r = await exchange.insertRefinerMetals(c, orderId, metals);
    await sync(c, orderId, ["refinerSpots"]);
    return r;
  });

export const insertOrderMetals = (client, orderId, metals) =>
  both(client, async (c) => {
    const r = await exchange.insertOrderMetals(c, orderId, metals);
    await sync(c, orderId, ["spots"]);
    return r;
  });

export const updateSpot = ({ spot, updated_spot }, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateSpot({ spot, updated_spot }, c);
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
    const id = await exchange.insertOrder(c, args);
    await next.mirrorOrder(id, c);
    await next.mirrorAddress(id, c);
    return id;
  });
