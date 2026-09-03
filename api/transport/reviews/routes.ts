// Reviews. Admin throughout except get_public, which is what the storefront shows an anonymous visitor.
import express from "express";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { getOne, getAll, getPublic, create, update, remove } from "#transport/reviews/controller.ts";

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", requireAdmin, getAll);
router.get("/get_public", getPublic);
router.post("/create", requireAdmin, create);
router.post("/update", requireAdmin, update);
router.delete("/delete", requireAdmin, remove);

export default router;
