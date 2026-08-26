// Dual-write phase of the sales orders migration.
//
// Every write goes to exchange first and is then mirrored into the orders
// schema, both inside one transaction. Reads come from the new schema, so it is
// exercised by real traffic while exchange stays a complete replica - which is
// what makes the switch reversible.
//
// Same shape as purchase orders, and smaller: eight writes rather than
// twenty-nine, and no offer to keep in step. The mirror re-derives the whole
// order from exchange rather than applying each change twice, so there is one
// definition of a sales order in the new schema and every write exercises it.
//
// The executor is threaded through every wrapper and every mirror. A mirror
// that opened its own connection would leave its row behind when the caller
// rolled back, which is the exact divergence this phase exists to prevent -
// and is the mistake fourteen exchange writes and twelve dual wrappers made on
// the purchase order side before the tests caught it.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/sales-orders/repo.exchange.js";
import * as next from "#features/sales-orders/repo.next.ts";

// Reads come from the new schema: exercising it is the point of this phase.
export const findById = next.findById;
export const findAllByUser = next.findAllByUser;
export const getAll = next.getAll;
export const findMetalsByOrderId = next.findMetalsByOrderId;

const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

const sync = async (c, orderId, parts) => {
  if (!orderId) return;
  if (parts.includes("order")) await next.mirrorOrder(orderId, c);
  if (parts.includes("items")) await next.mirrorItems(orderId, c);
  if (parts.includes("spots")) await next.mirrorSpots(orderId, c);
};

// --------------------------------------------------------- order-level writes

export const updateStatus = (order, order_status, user_name, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateStatus(order, order_status, user_name, c);
    await sync(c, order.id, ["order"]);
    return r;
  });

export const updateTrackingStatus = (orderId, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateTrackingStatus(orderId, c);
    await sync(c, orderId, ["order"]);
    return r;
  });

export const updateOrderSent = (orderId, client) =>
  both(client, async (c) => {
    const r = await exchange.updateOrderSent(orderId, c);
    await sync(c, orderId, ["order"]);
    return r;
  });

export const createReview = ({ order }, executor) =>
  both(executor, async (c) => {
    const r = await exchange.createReview({ order }, c);
    await sync(c, order.id, ["order"]);
    return r;
  });

// supplier_id becomes refinery_id, which is the one column where a sales order
// carries something a purchase order does not.
export const attachSupplierToOrder = (id, supplier_id, client) =>
  both(client, async (c) => {
    const r = await exchange.attachSupplierToOrder(id, supplier_id, c);
    await sync(c, id, ["order"]);
    return r;
  });

// ------------------------------------------------------------- item and spot

export const insertItems = (client, orderId, items, spot_prices) =>
  both(client, async (c) => {
    const r = await exchange.insertItems(c, orderId, items, spot_prices);
    await sync(c, orderId, ["items"]);
    return r;
  });

export const insertOrderMetals = (orderId, spot_prices, client) =>
  both(client, async (c) => {
    const r = await exchange.insertOrderMetals(orderId, spot_prices, c);
    await sync(c, orderId, ["spots"]);
    return r;
  });

// -------------------------------------------------------------------- creation

// The only write that makes an id. exchange generates it and the mirror copies
// it, so the two schemas agree by construction rather than by both generating
// one and hoping they match. A new order also needs its address snapshot, which
// nothing else creates.
export const insertOrder = (client, args) =>
  both(client, async (c) => {
    const created = await exchange.insertOrder(c, args);
    const id = created?.id ?? created;
    await next.mirrorOrder(id, c);
    await next.mirrorAddress(id, c);
    return created;
  });
