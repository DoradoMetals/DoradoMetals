const express = require("express");
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
const { getUser } = require("../controllers/admin/adminUserController");
const {
  getAllPurchaseOrders,
  getAdminPurchaseOrderMetals,
  changePurchaseOrderStatus,
  updateOrderScrapPercentage,
  resetOrderScrapPercentage,
  updateOrderSpot,
  lockOrderSpots,
  resetOrderSpots,
  updateOrderScrapItem,
  deleteOrderScrapItem,
  saveOrderItems,
  resetOrderItem,
  addNewOrderScrapItem,
  updateOrderBullionItem,
  deleteOrderBullionItem,
  addNewOrderBullionItem,
} = require("../controllers/admin/adminPurchaseOrdersController");

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
router.post("/save_order_items", saveOrderItems);
router.post("/reset_order_item", resetOrderItem);
router.post("/update_order_scrap_item", updateOrderScrapItem);
router.post("/delete_order_scrap_items", deleteOrderScrapItem);
router.post("/add_new_order_scrap_item", addNewOrderScrapItem);
router.post("/update_order_bullion_item", updateOrderBullionItem);
router.post("/delete_order_bullion_items", deleteOrderBullionItem);
router.post("/add_new_order_bullion_item", addNewOrderBullionItem);

module.exports = router;
