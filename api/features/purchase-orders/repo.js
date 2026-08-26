// Selects which schema the purchase-orders feature uses.
//
//   PURCHASE_ORDERS_SOURCE=exchange   (default) read exchange, write exchange
//   PURCHASE_ORDERS_SOURCE=dual                 read the orders schema, write BOTH
//
// `dual` now means what it says. Until this commit there were only two states,
// because writes all went to exchange and naming a state dual before it
// dual-wrote would have been a promise the name made and the code did not keep.
//
// Under dual, every write goes to exchange and the affected part of the order
// is then re-derived into the orders schema inside the same transaction. Both
// schemas hold the same order, so falling back to exchange loses nothing.
// That is what makes this reversible, and why the promotion goes through it
// rather than straight to next.
//
// `next` is not implemented and is deliberately absent from the switch rather
// than silently aliased to dual: writing only to the new schema is the one-way
// door, and it should be a separate, deliberate change.
//
// Gate on `pnpm --filter @dorado/api diff purchase-orders` before promoting.
import * as exchange from "#features/purchase-orders/repo.exchange.js";
import * as dual from "#features/purchase-orders/repo.dual.js";

// An unrecognised value is NOT an error: the Object.hasOwn check below falls
// back to `exchange`, silently. So a setting listed here that SOURCES does not
// contain reads as a working promotion and is not one.
const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.PURCHASE_ORDERS_SOURCE ?? "")
  ? process.env.PURCHASE_ORDERS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const findAllByUser = impl.findAllByUser;
export const findById = impl.findById;
export const getAll = impl.getAll;
export const findMetalsByOrderId = impl.findMetalsByOrderId;
export const updateOrderMetals = impl.updateOrderMetals;
export const updateOrderItemPrices = impl.updateOrderItemPrices;
export const moveOrderToAccepted = impl.moveOrderToAccepted;
export const rejectOfferById = impl.rejectOfferById;
export const cancelOrderById = impl.cancelOrderById;
export const clearOrderMetals = impl.clearOrderMetals;
export const updateOfferNotes = impl.updateOfferNotes;
export const createReview = impl.createReview;
export const insertOrder = impl.insertOrder;
export const insertItems = impl.insertItems;
export const insertOrderMetals = impl.insertOrderMetals;
export const insertPayout = impl.insertPayout;
export const clearItemPrices = impl.clearItemPrices;
export const resetOrderTotal = impl.resetOrderTotal;
export const updateOffer = impl.updateOffer;
export const updateStatus = impl.updateStatus;
export const toggleSpots = impl.toggleSpots;
export const updateSpot = impl.updateSpot;
export const toggleOrderItemStatus = impl.toggleOrderItemStatus;
export const deleteOrderItems = impl.deleteOrderItems;
export const createOrderItem = impl.createOrderItem;
export const updateBullion = impl.updateBullion;
export const findExpiredOffers = impl.findExpiredOffers;
export const getCurrentSpotPrices = impl.getCurrentSpotPrices;
export const editShippingCharge = impl.editShippingCharge;
export const editPayoutCharge = impl.editPayoutCharge;
export const changePayoutMethod = impl.changePayoutMethod;
export const purgeCancelled = impl.purgeCancelled;
export const updateRefinerMetals = impl.updateRefinerMetals;
export const findRefinerMetalsByOrderId = impl.findRefinerMetalsByOrderId;
export const insertRefinerMetals = impl.insertRefinerMetals;
export const updateRefinerSpot = impl.updateRefinerSpot;
export const updatePremium = impl.updatePremium;
export const findOrderScrapItems = impl.findOrderScrapItems;
export const updateRefinerPremium = impl.updateRefinerPremium;
export const updateShippingActual = impl.updateShippingActual;
export const updateRefinerFee = impl.updateRefinerFee;
export const updatePoolOzDeducted = impl.updatePoolOzDeducted;
export const updatePoolRemediation = impl.updatePoolRemediation;
export const findPayoutDetails = impl.findPayoutDetails;
