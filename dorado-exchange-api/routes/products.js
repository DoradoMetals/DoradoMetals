const express = require("express");
const { getFilteredProducts, getProductFilters } = require("../controllers/productsController");

const router = express.Router();

router.get("/get_products", getFilteredProducts);
router.get("/get_product_filters", getProductFilters);

module.exports = router;