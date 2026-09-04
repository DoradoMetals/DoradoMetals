import express from "express";
import {
  catalogQuote,
  salesOrderQuote,
  purchaseOrderQuote,
  orderQuote,
  profitBreakdown,
} from "#transport/quotes/controller.ts";
import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
// The order quote prices an EXISTING order by id, so it needs what every
// order route needs: not just a session but ownership - a customer may only
// quote their own order, an admin any. Same guard, same body spelling
// (order_id is one of the two requireOwnOrder reads).
import { requireOwnOrder } from "#shared/middleware/ownership.ts";

const router = express.Router();

// All POST, all pure reads — a quote takes items/choices, never prices or spots, and stores nothing.
// /catalog is UNGUARDED like GET /spots — public product list + public spot feed, derivable by anyone. sales_order is per-caller (prices against a funds row: the session user's, or an admin-named customer's) so it requires a session.
router.post("/catalog", catalogQuote);
router.post("/sales_order", requireUser, salesOrderQuote);
// Public like the catalogue's bid side — prices goods for a visitor, reads nothing about a user. The sales-order quote stays guarded since it prices against the caller's funds.
router.post("/purchase_order", purchaseOrderQuote);
// GUARDED, unlike the two goods quotes: this one names a stored order and
// answers with what that order is worth, which is the owner's business and
// the admins' and nobody else's.
router.post("/order", requireUser, requireOwnOrder, orderQuote);
// Admin only, no ownership escape hatch — the response is the business's margins (refiner take, Dorado's cut, spot spread), never customer-reachable even for the customer's own order.
router.post("/profit_breakdown", requireAdmin, profitBreakdown);

export default router;
