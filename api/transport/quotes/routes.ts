import express from "express";
import {
  catalogQuote,
  salesOrderQuote,
  purchaseOrderQuote,
  orderQuote,
  profitBreakdown,
} from "#transport/quotes/controller.ts";
import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrder } from "#shared/middleware/ownership.ts";

const router = express.Router();

router.post("/catalog", catalogQuote);
router.post("/sales_order", requireUser, salesOrderQuote);
router.post("/purchase_order", purchaseOrderQuote);
router.post("/order", requireUser, requireOwnOrder, orderQuote);
router.post("/profit_breakdown", requireAdmin, profitBreakdown);

export default router;
