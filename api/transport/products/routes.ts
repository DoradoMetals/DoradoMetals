import express from "express";

import {
  createProduct, getProduct, listAdminProducts, listProducts, listTypes, updateProduct,
} from "#transport/products/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The literal segments are declared before `/:slug`, which would otherwise
// match them. Filters are query params, never path variants (rest-routes.md).
router.get("/types", requireAdmin, listTypes);
router.get("/admin", requireAdmin, listAdminProducts);
router.get("/", listProducts);
router.get("/:slug", getProduct);

router.post("/", requireAdmin, createProduct);
router.patch("/:id", requireAdmin, updateProduct);

export default router;
