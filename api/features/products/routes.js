import express from "express";

import {
  createProduct,
  getAllAdminProducts,
  getAllProducts,
  getAllTypes,
  getFilteredProducts,
  getHomepageProducts,
  getProductFromSlug,
  getSellProducts,
  saveProduct,
} from "#features/products/controller.js";

// Mints are owned by #features/mints. The route stays here because the
// frontend calls /products/get_mints; only the implementation moved.
import { getAllMints } from "#features/mints/controller.js";
// Metals are owned by #features/spots, which owns exchange.metals. Route stays
// because the frontend calls /products/get_metals.
import { getAllMetals } from "#features/spots/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get_all_products", getAllProducts);
router.get("/get_sell_products", getSellProducts);
router.get("/get_homepage_products", getHomepageProducts);
router.get("/get_products", getFilteredProducts);
router.get("/get_product_from_slug", getProductFromSlug);

router.get("/get_admin_products", requireAdmin, getAllAdminProducts);
router.get("/get_metals", requireAdmin, getAllMetals);
router.get("/get_mints", requireAdmin, getAllMints);
router.get("/get_product_types", requireAdmin, getAllTypes);
router.post("/save_product", requireAdmin, saveProduct);
router.post("/create_product", requireAdmin, createProduct);

export default router;
