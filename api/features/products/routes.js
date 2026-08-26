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
} from "#features/products/controller.ts";

// Mints are owned by #features/mints. The route stays here because the
// frontend calls /products/get_mints; only the implementation moved.
import { getAllMints } from "#features/mints/controller.js";
// Metals are owned by #features/spots, which owns exchange.metals. Route stays
// because the frontend calls /products/get_metals.
import { getAllMetals } from "#features/spots/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";
import * as productsWire from "#features/products/wire.ts";
import { wireShape } from "#shared/wire/middleware.ts";

const router = express.Router();

// Mounted per-route rather than for the whole feature, because the two write
// routes disagree about where the product is: save_product takes
// { product, user } and create_product takes the product itself. Everything
// else only needs the response converted.
const wire = (body) => wireShape(productsWire, body === undefined ? {} : { body });

router.get("/get_all_products", wire(false), getAllProducts);
router.get("/get_sell_products", wire(false), getSellProducts);
router.get("/get_homepage_products", wire(false), getHomepageProducts);
router.get("/get_products", wire(false), getFilteredProducts);
router.get("/get_product_from_slug", wire(false), getProductFromSlug);

router.get("/get_admin_products", requireAdmin, wire(false), getAllAdminProducts);
router.get("/get_metals", requireAdmin, getAllMetals);
router.get("/get_mints", requireAdmin, getAllMints);
router.get("/get_product_types", requireAdmin, getAllTypes);
router.post("/save_product", requireAdmin, wire("product"), saveProduct);
router.post("/create_product", requireAdmin, wire(), createProduct);

export default router;
