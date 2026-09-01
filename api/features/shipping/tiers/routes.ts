import express from "express";

import { getTiers } from "#features/shipping/tiers/controller.ts";

// Mounted by features/shipping/routes.ts at /tiers, so the path is
// GET /api/shipping/tiers.
//
// PUBLIC, deliberately: the product page shows the tier prices to signed-out
// visitors, exactly as the hardcoded record it replaces did. A label price
// the public page already prints is nobody's secret.
const router = express.Router();

router.get("/", getTiers);

export default router;
