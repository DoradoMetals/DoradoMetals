const express = require("express");
const {  getAllProducts, getHomepageProducts, getFilteredProducts } = require("../controllers/productsController");

const router = express.Router();

router.get("/get_all_products", getAllProducts);
router.get("/get_homepage_products", getHomepageProducts);
router.get("/get_products", getFilteredProducts);

module.exports = router;