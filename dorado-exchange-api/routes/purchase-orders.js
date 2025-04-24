const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { getPurchaseOrders, createPurchaseOrder } = require("../controllers/purchase-orders/purchaseOrderController");

const router = express.Router();

router.get("/get_purchase_orders", requireAuth, getPurchaseOrders);
router.post("/create_purchase_order", requireAuth, createPurchaseOrder);

module.exports = router;
 