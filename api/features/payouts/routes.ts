import express from "express";

import { patchPayout } from "#features/payouts/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The payout's cost and method, addressed by the payout id the order wire
// serves (order.payout.id). Admin-only, and the handler never touches the
// bank numbers - full values stay behind get_payout_details.
router.patch("/:id", requireAdmin, patchPayout);

export default router;
