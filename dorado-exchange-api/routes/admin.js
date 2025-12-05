import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
  getAllProducts,
  getAllMetals,
  getAllSuppliers,
  getAllMints,
  getAllTypes,
  saveProduct,
  createProduct,
} from "../controllers/admin/adminProductsController.js";

const router = express.Router();

router.get("/get_products", requireAdmin, getAllProducts);
router.get("/get_metals", requireAdmin, getAllMetals);
router.get("/get_suppliers", requireAdmin, getAllSuppliers);
router.get("/get_mints", requireAdmin, getAllMints);
router.get("/get_product_types", requireAdmin, getAllTypes);
router.post("/save_product", requireAdmin, saveProduct);
router.post("/create_product", requireAdmin, createProduct);

export default router;
