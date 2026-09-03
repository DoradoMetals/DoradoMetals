import express from "express";

import { patchPayout, getPayoutDetails } from "#transport/payouts/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The payout's cost and method, keyed by the payout id the order wire serves (order.payout.id). Admin-only; never touches bank numbers.
router.patch("/:id", requireAdmin, patchPayout);

// Full bank details, admin only, payout-keyed - the one read allowed to carry them. Kept off the order payloads on purpose.
router.get("/:id/details", requireAdmin, getPayoutDetails);

export default router;
