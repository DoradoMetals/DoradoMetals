const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  getPurchaseOrders,
  getPurchaseOrderMetals,
  createPurchaseOrder,
  acceptOffer,
  rejectOffer,
  updateOfferNotes,
  cancelOrder,
} = require("../controllers/purchase-orders/purchaseOrderController");

const router = express.Router();

router.get("/get_purchase_orders", requireAuth, getPurchaseOrders);
router.post("/get_purchase_order_metals", requireAuth, getPurchaseOrderMetals);
router.post("/create_purchase_order", requireAuth, createPurchaseOrder);
router.post("/accept_offer", requireAuth, acceptOffer);
router.post("/reject_offer", requireAuth, rejectOffer);
router.post("/update_offer_notes", requireAuth, updateOfferNotes);
router.post("/cancel_order", requireAuth, cancelOrder);

module.exports = router;
