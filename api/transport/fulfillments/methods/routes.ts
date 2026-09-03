import express from "express";

import {
  getAllMethods,
  getMethods,
  updateMethod,
} from "#transport/fulfillments/methods/controller.ts";

import { requireAdmin, requireUser } from "#shared/middleware/authMiddleware.ts";

// Mounted at /methods by transport/fulfillments/routes.ts, so the live paths are unchanged: GET /api/fulfillments/methods, GET .../methods/all, POST .../methods/update.
const router = express.Router();

router.get("/", requireUser, getMethods);
router.get("/all", requireAdmin, getAllMethods);
router.post("/update", requireAdmin, updateMethod);

export default router;
