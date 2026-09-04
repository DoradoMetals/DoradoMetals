import express from "express";

import { patchRefinerItem } from "#transport/refiners/items/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.patch("/items/by-order-item/:orderItemId", requireAdmin, patchRefinerItem);

export default router;
