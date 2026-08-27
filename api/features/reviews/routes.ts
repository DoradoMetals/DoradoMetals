// Reviews. Admin throughout except get_public, which is what the storefront
// shows an anonymous visitor.
//
// Paths are unchanged from the previous implementation on purpose: this
// restructure is meant to be invisible to the frontend.
import express from "express";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { getOne, getAll, getPublic, create, update, remove } from "#features/reviews/controller.ts";

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", requireAdmin, getAll);
router.get("/get_public", getPublic);
router.post("/create", requireAdmin, create);
router.post("/update", requireAdmin, update);
router.delete("/delete", requireAdmin, remove);

export default router;
