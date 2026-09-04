import express from "express";

import { patchPayout, getPayoutDetails } from "#transport/payouts/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.patch("/:id", requireAdmin, patchPayout);

router.get("/:id/details", requireAdmin, getPayoutDetails);

export default router;
