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
const {
  getUser,
  getAllUsers,
} = require("../controllers/admin/adminUserController");
const {
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

const {
  acceptOffer,
  rejectOffer,
} = require("../controllers/purchaseOrderController");

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
router.get("/get_all_users", getAllUsers);

//purchase orders
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
router.post("/accept_offer", acceptOffer);
router.post("/reject_offer", rejectOffer);

module.exports = router;
