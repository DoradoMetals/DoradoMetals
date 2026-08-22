// Selects which schema the purchase-orders feature reads from.
//
// Reads only. Every write still goes to exchange, unconditionally, because the
// write path has not been split yet - 38 of this feature's functions mutate
// something, and moving them is the next piece of work. Until then there is
// nothing here that can lose a row: the new schema is read from and never
// written to, and exchange stays exactly as authoritative as it was.
//
//   PURCHASE_ORDERS_SOURCE=exchange   (default) read exchange
//   PURCHASE_ORDERS_SOURCE=next                 read the orders schema
//
// There is deliberately no `dual` yet. Dual means dual-WRITE, and promising
// that before the writes are split would be a lie the name tells for us.
//
// Gate on `pnpm --filter @dorado/api diff purchase-orders` before promoting.
import * as exchange from "#features/purchase-orders/repo.exchange.js";
import * as next from "#features/purchase-orders/repo.next.js";

const SOURCES = { exchange, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.PURCHASE_ORDERS_SOURCE ?? "")
  ? process.env.PURCHASE_ORDERS_SOURCE
  : "exchange";

const reads = SOURCES[SOURCE];

export const activeSource = SOURCE;

// Reads - switchable.
export const findAllByUser = reads.findAllByUser;
export const findById = reads.findById;
export const getAll = reads.getAll;
export const findMetalsByOrderId = reads.findMetalsByOrderId;
export const findOrderScrapItems = reads.findOrderScrapItems;
export const findExpiredOffers = reads.findExpiredOffers;

// Writes - exchange only, until the write path is split.
export const updateOrderMetals = exchange.updateOrderMetals;
export const updateOrderItemPrices = exchange.updateOrderItemPrices;
export const moveOrderToAccepted = exchange.moveOrderToAccepted;
export const rejectOfferById = exchange.rejectOfferById;
export const cancelOrderById = exchange.cancelOrderById;
export const clearOrderMetals = exchange.clearOrderMetals;
export const updateOfferNotes = exchange.updateOfferNotes;
export const createReview = exchange.createReview;
export const insertOrder = exchange.insertOrder;
export const insertItems = exchange.insertItems;
export const insertOrderMetals = exchange.insertOrderMetals;
export const insertPayout = exchange.insertPayout;
export const clearItemPrices = exchange.clearItemPrices;
export const resetOrderTotal = exchange.resetOrderTotal;
export const updateOffer = exchange.updateOffer;
export const updateStatus = exchange.updateStatus;
export const toggleSpots = exchange.toggleSpots;
export const updateSpot = exchange.updateSpot;
export const toggleOrderItemStatus = exchange.toggleOrderItemStatus;
export const deleteOrderItems = exchange.deleteOrderItems;
export const createOrderItem = exchange.createOrderItem;
export const updateBullion = exchange.updateBullion;
export const getCurrentSpotPrices = exchange.getCurrentSpotPrices;
export const editShippingCharge = exchange.editShippingCharge;
export const editPayoutCharge = exchange.editPayoutCharge;
export const changePayoutMethod = exchange.changePayoutMethod;
export const purgeCancelled = exchange.purgeCancelled;
export const updateRefinerMetals = exchange.updateRefinerMetals;
export const findRefinerMetalsByOrderId = exchange.findRefinerMetalsByOrderId;
export const insertRefinerMetals = exchange.insertRefinerMetals;
export const updateRefinerSpot = exchange.updateRefinerSpot;
export const updatePremium = exchange.updatePremium;
export const updateRefinerPremium = exchange.updateRefinerPremium;
export const updateShippingActual = exchange.updateShippingActual;
export const updateRefinerFee = exchange.updateRefinerFee;
export const updatePoolOzDeducted = exchange.updatePoolOzDeducted;
export const updatePoolRemediation = exchange.updatePoolRemediation;
export const findPayoutDetails = exchange.findPayoutDetails;
