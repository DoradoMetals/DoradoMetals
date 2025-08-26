const express = require("express");
const { requireUser, requireAdmin } = require("../middleware/authMiddleware");
const {
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
  updateScrapPercentage,
  resetScrapPercentage,
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
} = require("../controllers/purchaseOrderController");

const router = express.Router();

// user
router.get("/get_purchase_orders", requireUser, getPurchaseOrders);
router.post("/get_purchase_order_metals", requireUser, getPurchaseOrderMetals);
router.post("/create_purchase_order", requireUser, createPurchaseOrder);
router.post("/accept_offer", requireUser, acceptOffer);
router.post("/reject_offer", requireUser, rejectOffer);
router.post("/update_offer_notes", requireUser, updateOfferNotes);
router.post("/cancel_order", requireUser, cancelOrder);
router.post("/create_review", requireUser, createReview);

// admin
router.get("/get_all_purchase_orders", requireAdmin, getAllPurchaseOrders);
router.post("/send_offer", requireAdmin, sendOffer);
router.post("/update_status", requireAdmin, updateStatus);
router.post("/update_rejected_offer", requireAdmin, updateRejectedOffer);
router.post("/update_scrap", requireAdmin, updateScrapPercentage);
router.post("/reset_scrap", requireAdmin, resetScrapPercentage);
router.post("/update_spot", requireAdmin, updateSpot);
router.post("/lock_spots", requireAdmin, lockSpots);
router.post("/unlock_spots", requireAdmin, unlockSpots);
router.post("/save_order_items", requireAdmin, saveOrderItems);
router.post("/reset_order_item", requireAdmin, resetOrderItems);
router.post("/delete_order_items", requireAdmin, deleteOrderItems);
router.post("/create_order_item", requireAdmin, createOrderItem);
router.post("/update_scrap_item", requireAdmin, updateScrapItem);
router.post("/update_bullion_item", requireAdmin, updateBullion);
router.post("/edit_shipping_charge", requireAdmin, editShippingCharge);
router.post("/edit_payout_charge", requireAdmin, editPayoutCharge);
router.post("/edit_payout_method", requireAdmin, changePayoutMethod);
router.post("/add_funds_to_account", requireAdmin, addFundsToAccount),
router.delete("/purge_cancelled", requireAdmin, purgeCancelled);

module.exports = router;
