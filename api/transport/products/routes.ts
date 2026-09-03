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
} from "#transport/products/controller.ts";

// Mints are owned by the mints feature. The route stays here because the
// frontend calls /products/get_mints; only the implementation moved.
import { getAllMints } from "#transport/mints/controller.ts";
// Metals are owned by the spots feature, which owns exchange.metals. Route stays
// because the frontend calls /products/get_metals.
import { getAllMetals } from "#transport/spots/controller.ts";

import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// NO WIRE ADAPTER. Products is the third CONVERTED feature (2026-08-27): the
// frontend types derive from @dorado/contracts and read products.bullion's
// own names - `name` / `description` / `type` - and the admin writes send
// them natively, so there is nothing left to rename in either direction.
// The exchange REPOS still translate at the SQL edge (product_name AS name,
// and the dual-write UPDATEs in sql/legacy/) because exchange's columns keep
// their names forever - that is schema, not wire.

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
