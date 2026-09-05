import express from "express";

import { patchRefinerOrder } from "#orders/refiners/orders/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.patch("/orders/:id", requireAdmin, patchRefinerOrder);

export default router;
