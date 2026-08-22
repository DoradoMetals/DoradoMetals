// Selects which schema the sales-orders feature reads from.
//
// Reads only, like purchase-orders. Every write still goes to exchange, because
// the write path has not been split yet. There is no `dual` state, and there
// will not be one until writes actually go to both places - dual means
// dual-write, and the name should not promise it early.
//
//   SALES_ORDERS_SOURCE=exchange   (default) read exchange
//   SALES_ORDERS_SOURCE=next                 read the orders schema
//
// Gate on `pnpm --filter @dorado/api diff sales-orders` before promoting.
import * as exchange from "#features/sales-orders/repo.exchange.js";
import * as next from "#features/sales-orders/repo.next.js";

const SOURCES = { exchange, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.SALES_ORDERS_SOURCE ?? "")
  ? process.env.SALES_ORDERS_SOURCE
  : "exchange";

const reads = SOURCES[SOURCE];

export const activeSource = SOURCE;

// Reads - switchable.
export const findById = reads.findById;
export const findAllByUser = reads.findAllByUser;
export const getAll = reads.getAll;
export const findMetalsByOrderId = reads.findMetalsByOrderId;

// Writes - exchange only, until the write path is split.
export const insertOrder = exchange.insertOrder;
export const insertItems = exchange.insertItems;
export const insertOrderMetals = exchange.insertOrderMetals;
export const updateStatus = exchange.updateStatus;
export const updateTrackingStatus = exchange.updateTrackingStatus;
export const updateOrderSent = exchange.updateOrderSent;
export const attachSupplierToOrder = exchange.attachSupplierToOrder;
export const createReview = exchange.createReview;
