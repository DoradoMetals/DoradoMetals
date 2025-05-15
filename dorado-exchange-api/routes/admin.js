const express = require("express");
const { getAllProducts, getAllMetals, getAllSuppliers, getAllMints, getAllTypes, saveProduct, deleteProduct, createProduct, getInventory } = require("../controllers/admin/adminProductsController");
const { getAllScrap } = require("../controllers/admin/adminScrapController");
const { getUser } = require("../controllers/admin/adminUserController");
const { getAllPurchaseOrders, getAdminPurchaseOrderMetals, changePurchaseOrderStatus, updateOrderScrapPercentage, resetOrderScrapPercentage, updateOrderSpot, lockOrderSpots, resetOrderSpots } = require("../controllers/admin/adminPurchaseOrdersController");

const router = express.Router();

//products
router.get("/get_products", getAllProducts);
router.get("/get_metals", getAllMetals);
router.get("/get_suppliers", getAllSuppliers);
router.get("/get_mints", getAllMints);
router.get("/get_product_types", getAllTypes);
router.post("/save_product", saveProduct);
router.post("/create_product", createProduct);
router.post("/delete_product", deleteProduct);
router.get("/get_inventory", getInventory);

//scrap
router.get("/get_scrap", getAllScrap);

//users
router.get("/get_user", getUser);

//purchase orders
router.get("/get_admin_purchase_orders", getAllPurchaseOrders);
router.post("/get_admin_purchase_order_metals", getAdminPurchaseOrderMetals);
router.post("/change_purchase_order_status", changePurchaseOrderStatus);
router.post("/update_purchase_order_scrap_percentage", updateOrderScrapPercentage);
router.post("/reset_purchase_order_scrap_percentage", resetOrderScrapPercentage);
router.post("/update_purchase_order_spot", updateOrderSpot);
router.post("/lock_purchase_order_spots", lockOrderSpots);
router.post("/reset_purchase_order_spots", resetOrderSpots);

module.exports = router;