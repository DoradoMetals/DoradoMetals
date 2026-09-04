// Leads. Admin-only throughout - a lead is a sales contact, not customer data.
// REST (D214 item 4): the verb is the METHOD and the lead is named once, in
// the path. `/get_one`, `/get_all`, `/create`, `/update`, `/delete` are gone.
import express from "express";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { getOne, getAll, create, update, remove } from "#transport/leads/controller.ts";

const router = express.Router();

router.get("/", requireAdmin, getAll);
router.post("/", requireAdmin, create);
router.get("/:id", requireAdmin, getOne);
router.patch("/:id", requireAdmin, update);
router.delete("/:id", requireAdmin, remove);

export default router;
