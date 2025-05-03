const express = require("express");
const {  getAllProducts, getHomepageProducts, getFilteredProducts, getProductFilters } = require("../controllers/productsController");

const router = express.Router();

router.get("/get_all_products", getAllProducts);
router.get("/get_homepage_products", getHomepageProducts);
router.get("/get_products", getFilteredProducts);
router.get("/get_product_filters", getProductFilters);

module.exports = router;