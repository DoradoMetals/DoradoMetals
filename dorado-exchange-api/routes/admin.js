const express = require("express");

const { requireAdmin } = require("../middleware/authMiddleware");

const {
  getAllProducts,
  getAllMetals,
  getAllSuppliers,
  getAllMints,
  getAllTypes,
  saveProduct,
  deleteProduct,
  createProduct,
  getInventory,
} = require("../controllers/admin/adminProductsController");

const { getAllScrap } = require("../controllers/admin/adminScrapController");

const {
  getUser,
  getAllUsers,
} = require("../controllers/admin/adminUserController");

const router = express.Router();

//products
router.get("/get_products", requireAdmin, getAllProducts);
router.get("/get_metals", requireAdmin, getAllMetals);
router.get("/get_suppliers", requireAdmin, getAllSuppliers);
router.get("/get_mints", requireAdmin, getAllMints);
router.get("/get_product_types", requireAdmin, getAllTypes);
router.post("/save_product", requireAdmin, saveProduct);
router.post("/create_product", requireAdmin, createProduct);
router.post("/delete_product", requireAdmin, deleteProduct);
router.get("/get_inventory", requireAdmin, getInventory);

//scrap
router.get("/get_scrap", requireAdmin, getAllScrap);

//users
router.get("/get_user", requireAdmin, getUser);
router.get("/get_all_users", requireAdmin, getAllUsers);

module.exports = router;
