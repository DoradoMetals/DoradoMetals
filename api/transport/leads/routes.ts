// Leads. Admin-only throughout - a lead is a sales contact, not customer data.
import express from "express";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { getOne, getAll, create, update, remove } from "#transport/leads/controller.ts";

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", requireAdmin, getAll);
router.post("/create", requireAdmin, create);
router.post("/update", requireAdmin, update);
router.delete("/delete", requireAdmin, remove);

export default router;
