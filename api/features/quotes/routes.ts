import express from "express";
import {
  catalogQuote,
  salesOrderQuote,
  purchaseOrderQuote,
} from "#features/quotes/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// All POST and all pure reads: a quote takes a body - items and choices,
// never prices or spots - and stores nothing.
//
// /catalog is UNGUARDED like /spots/spot_prices, and for the same reason: the
// catalogue quotes prices to anyone who visits, and the response is derivable
// from the public product list and the public spot feed. The other two are
// per-caller - sales_order prices against the session user's funds row - so
// they take requireUser.
router.post("/catalog", catalogQuote);
router.post("/sales_order", requireUser, salesOrderQuote);
// Public like the catalogue's bid side, and for the same reason: this prices
// what the business would pay for goods a visitor is still weighing, reads
// nothing about a user, and the anonymous sell-cart always showed estimates.
// The sales-order quote stays guarded - it prices against the caller's funds.
router.post("/purchase_order", purchaseOrderQuote);

export default router;
