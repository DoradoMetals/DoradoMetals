const express = require("express");
const { getAllProducts, getAllMetals, getAllSuppliers, getAllMints, getAllTypes } = require("../controllers/adminProductsController");

const router = express.Router();

router.get("/get_products", getAllProducts);
router.get("/get_metals", getAllMetals);
router.get("/get_suppliers", getAllSuppliers);
router.get("/get_mints", getAllMints);
router.get("/get_product_types", getAllTypes);

module.exports = router;