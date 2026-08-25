import express from 'express';

import {
  getPurchaseOrders,
  getPurchaseOrderMetals,
  createPurchaseOrder,
  acceptOffer,
  rejectOffer,
  updateOfferNotes,
  cancelOrder,
  createReview,
  getAllPurchaseOrders,
  sendOffer,
  updateStatus,
  updateRejectedOffer,
  updateSpot,
  lockSpots,
  unlockSpots,
  saveOrderItems,
  resetOrderItems,
  deleteOrderItems,
  updateScrapItem,
  createOrderItem,
  updateBullion,
  editShippingCharge,
  editPayoutCharge,
  addFundsToAccount,
  changePayoutMethod,
  purgeCancelled,
  updateRefinerSpot,
  getPurchaseOrderRefinerMetals,
  updateRefinerPremium,
  updateShippingActual,
  updateRefinerFee,
  updatePoolOzDeducted,
  updatePoolRemediation,
  getPayoutDetails,
} from "#features/purchase-orders/controller.js";

import { 
  requireUser, 
  requireAdmin 
} from "#shared/middleware/authMiddleware.js";
// requireUser asks whether somebody is signed in; this asks whether the order
// is theirs. Every route below that takes an order out of the request body
// needs both, and until this existed a customer could act on any order whose id
// they had - including cancelling it, which buys a FedEx return label.
import { requireOwnOrder } from "#shared/middleware/ownership.js";

const router = express.Router();

// user
router.get('/get_purchase_orders', requireUser, getPurchaseOrders);
router.post('/get_purchase_order_metals', requireUser, requireOwnOrder, getPurchaseOrderMetals);
router.post('/create_purchase_order', requireUser, createPurchaseOrder);
router.post('/accept_offer', requireUser, requireOwnOrder, acceptOffer);
router.post('/reject_offer', requireUser, requireOwnOrder, rejectOffer);
router.post('/update_offer_notes', requireUser, requireOwnOrder, updateOfferNotes);
router.post('/cancel_order', requireUser, requireOwnOrder, cancelOrder);
router.post('/create_review', requireUser, requireOwnOrder, createReview);

// admin
router.get('/get_all_purchase_orders', requireAdmin, getAllPurchaseOrders);
router.post('/send_offer', requireAdmin, sendOffer);
router.post('/update_status', requireAdmin, updateStatus);
router.post('/update_rejected_offer', requireAdmin, updateRejectedOffer);
router.post('/update_spot', requireAdmin, updateSpot);
router.post('/lock_spots', requireAdmin, lockSpots);
router.post('/unlock_spots', requireAdmin, unlockSpots);
router.post('/save_order_items', requireAdmin, saveOrderItems);
router.post('/reset_order_item', requireAdmin, resetOrderItems);
router.post('/delete_order_items', requireAdmin, deleteOrderItems);
router.post('/create_order_item', requireAdmin, createOrderItem);
router.post('/update_scrap_item', requireAdmin, updateScrapItem);
router.post('/update_bullion_item', requireAdmin, updateBullion);
router.post('/edit_shipping_charge', requireAdmin, editShippingCharge);
router.post('/edit_payout_charge', requireAdmin, editPayoutCharge);
router.post('/edit_payout_method', requireAdmin, changePayoutMethod);
router.post('/add_funds_to_account', requireAdmin, addFundsToAccount);
router.delete('/purge_cancelled', requireAdmin, purgeCancelled);
router.post('/get_purchase_order_refiner_metals', requireAdmin, getPurchaseOrderRefinerMetals);
router.post('/update_refiner_spot', requireAdmin, updateRefinerSpot);
router.post('/update_refiner_premium', requireAdmin, updateRefinerPremium);
router.post('/update_shipping_actual', requireAdmin, updateShippingActual);
router.post('/update_refiner_fee', requireAdmin, updateRefinerFee);
router.post('/update_pool_oz_deducted', requireAdmin, updatePoolOzDeducted);
router.post('/update_pool_remediation', requireAdmin, updatePoolRemediation);

// Full bank details, admin only. Kept off the order payloads on purpose.
router.post('/get_payout_details', requireAdmin, getPayoutDetails);

export default router;
