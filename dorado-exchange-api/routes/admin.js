const express = require("express");
const { getAllProducts, getAllMetals, getAllSuppliers, getAllMints, getAllTypes, saveProduct, deleteProduct, createProduct } = require("../controllers/adminProductsController");

const router = express.Router();

router.get("/get_products", getAllProducts);
router.get("/get_metals", getAllMetals);
router.get("/get_suppliers", getAllSuppliers);
router.get("/get_mints", getAllMints);
router.get("/get_product_types", getAllTypes);
router.post("/save_product", saveProduct);
router.post("/create_product", createProduct);
router.post("/delete_product", deleteProduct);

module.exports = router;