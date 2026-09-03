import express from "express";

import { patchPayout, getPayoutDetails } from "#transport/payouts/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The payout's cost and method, addressed by the payout id the order wire
// serves (order.payout.id). Admin-only, and the handler never touches the
// bank numbers - full values stay behind get_payout_details.
router.patch("/:id", requireAdmin, patchPayout);

// Full bank details, admin only, payout-keyed - the one read allowed to carry
// them. Kept off the order payloads on purpose; see sql/get_details.sql.
router.get("/:id/details", requireAdmin, getPayoutDetails);

export default router;
