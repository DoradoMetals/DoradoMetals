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
router.post("/reset_scrap", requireAdmin, resetScrapPercentage),
router.post("/update_spot", requireAdmin, updateSpot);
router.post("/lock_spots", requireAdmin, lockSpots),
router.post("/unlock_spots", requireAdmin, unlockSpots);

module.exports = router;
