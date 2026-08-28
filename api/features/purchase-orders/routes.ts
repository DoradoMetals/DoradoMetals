import express from 'express';

import {
  getPurchaseOrders,
  getPurchaseOrderMetals,
  createPurchaseOrder,
  createReview,
  getAllPurchaseOrders,
  purgeCancelled,
  getPurchaseOrderRefinerMetals,
  getPayoutDetails,
} from "#features/purchase-orders/controller.ts";

import {
  requireUser,
  requireAdmin
} from "#shared/middleware/authMiddleware.ts";
// requireUser asks whether somebody is signed in; this asks whether the order
// is theirs. It reads the order id out of the request BODY, which is where
// every POST below carries it. Until it existed a customer could act on any
// order whose id they had.
import { requireOwnOrder } from "#shared/middleware/ownership.ts";

const router = express.Router();

// user
router.get('/get_purchase_orders', requireUser, getPurchaseOrders);
router.post('/get_purchase_order_metals', requireUser, requireOwnOrder, getPurchaseOrderMetals);
router.post('/create_purchase_order', requireUser, createPurchaseOrder);
router.post('/create_review', requireUser, requireOwnOrder, createReview);

// admin
// NO MUTATIONS HERE ANY MORE. Every order write lives under /api/orders - one
// namespace, both directions, direction validated as data (Jacob, 28 August;
// see features/orders/patch.service.ts for the endpoint table). These reads
// stay for this series and move to /api/orders reads in the read-pivot wave.
router.get('/get_all_purchase_orders', requireAdmin, getAllPurchaseOrders);
router.delete('/purge_cancelled', requireAdmin, purgeCancelled);
router.post('/get_purchase_order_refiner_metals', requireAdmin, getPurchaseOrderRefinerMetals);

// Full bank details, admin only. Kept off the order payloads on purpose.
router.post('/get_payout_details', requireAdmin, getPayoutDetails);

export default router;
