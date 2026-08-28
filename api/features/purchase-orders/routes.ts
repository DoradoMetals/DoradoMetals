import express from 'express';

import {
  createPurchaseOrder,
  createReview,
  purgeCancelled,
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

// CREATES AND THE REVIEW ONLY. The reads left with the read-flip wave the way
// the mutations left with D87: the lists live at GET /api/orders, the spots at
// GET /api/orders/:id/spots, the refiner spots at
// GET /api/refiners/orders/:id/spots (engagement-keyed), the bank details at
// GET /api/payouts/:id/details. Eight legacy read routes and their
// controllers deleted in that change; what remains here is creation - which
// keeps its form body, that IS user input - the review flag, and the purge.
router.post('/create_purchase_order', requireUser, createPurchaseOrder);
router.post('/create_review', requireUser, requireOwnOrder, createReview);

// admin
router.delete('/purge_cancelled', requireAdmin, purgeCancelled);

export default router;
