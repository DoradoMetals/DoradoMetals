import express from "express";

import { list, listAdmins, getOne, updateCredit } from "#transport/users/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.get("/admins", requireAdmin, listAdmins);
router.get("/", requireAdmin, list);
router.get("/:id", requireAdmin, getOne);
router.post("/:id/credit", requireAdmin, updateCredit);

export default router;
