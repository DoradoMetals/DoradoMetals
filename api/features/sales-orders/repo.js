// Selects which schema the sales-orders feature uses.
//
//   SALES_ORDERS_SOURCE=exchange   (default) read exchange, write exchange
//   SALES_ORDERS_SOURCE=dual                 read the orders schema, write BOTH
//
// `dual` means what it says now. It did not before this commit - writes all
// went to exchange - and the comment here said so rather than letting the name
// imply otherwise.
//
// Under dual every write goes to exchange and the affected part of the order is
// re-derived into the orders schema inside the same transaction, so both hold
// the same order and falling back to exchange loses nothing.
//
// `next` is deliberately absent from the switch rather than aliased to dual:
// writing only to the new schema is the one-way door, and it should be a
// separate, deliberate change.
//
// Gate on `pnpm --filter @dorado/api diff sales-orders` before promoting.
import * as exchange from "#features/sales-orders/repo.exchange.js";
import * as dual from "#features/sales-orders/repo.dual.js";

// An unrecognised value is NOT an error: the Object.hasOwn check below falls
// back to `exchange`, silently. So a setting listed here that SOURCES does not
// contain reads as a working promotion and is not one.
const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.SALES_ORDERS_SOURCE ?? "")
  ? process.env.SALES_ORDERS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const findById = impl.findById;
export const findAllByUser = impl.findAllByUser;
export const getAll = impl.getAll;
export const findMetalsByOrderId = impl.findMetalsByOrderId;
export const insertOrder = impl.insertOrder;
export const insertItems = impl.insertItems;
export const insertOrderMetals = impl.insertOrderMetals;
export const updateStatus = impl.updateStatus;
export const updateTrackingStatus = impl.updateTrackingStatus;
export const updateOrderSent = impl.updateOrderSent;
export const attachSupplierToOrder = impl.attachSupplierToOrder;
export const createReview = impl.createReview;
