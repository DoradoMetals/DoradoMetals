import express from "express";

import {
  getAllMethods,
  getMethods,
  updateMethod,
} from "#features/fulfillments/methods/controller.ts";

import { requireAdmin, requireUser } from "#shared/middleware/authMiddleware.ts";

// MOUNTED AT /methods BY features/fulfillments/routes.ts, so the live paths are
// unchanged: GET /api/fulfillments/methods, GET .../methods/all,
// POST .../methods/update. Ruling 13 - the URL and the file answer different
// questions, and factoring the file is not a reason to move the URL.
const router = express.Router();

router.get("/", requireUser, getMethods);
router.get("/all", requireAdmin, getAllMethods);
router.post("/update", requireAdmin, updateMethod);

export default router;
