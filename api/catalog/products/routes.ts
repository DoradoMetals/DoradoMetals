import express from "express";

import {
  createProduct, getProduct, listAdminProducts, listProducts, listTypes, updateProduct,
} from "#catalog/products/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.get("/types", requireAdmin, listTypes);
router.get("/admin", requireAdmin, listAdminProducts);
router.get("/", listProducts);
router.get("/:slug", getProduct);

router.post("/", requireAdmin, createProduct);
router.patch("/:id", requireAdmin, updateProduct);

export default router;
