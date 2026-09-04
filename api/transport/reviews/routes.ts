// Reviews. Admin throughout except /public, which is what the storefront shows an anonymous visitor.
// REST (D214 item 4): the verb is the METHOD and the review is named once, in
// the path. `/get_one`, `/get_all`, `/get_public`, `/create`, `/update`,
// `/delete` are gone.
import express from "express";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { getOne, getAll, getPublic, create, update, remove } from "#transport/reviews/controller.ts";

const router = express.Router();

// Declared before /:id so "public" is never read as a review id.
router.get("/public", getPublic);

router.get("/", requireAdmin, getAll);
router.post("/", requireAdmin, create);
router.get("/:id", requireAdmin, getOne);
router.patch("/:id", requireAdmin, update);
router.delete("/:id", requireAdmin, remove);

export default router;
