const express = require("express");
const { getAllProducts } = require("../controllers/productsController");

const router = express.Router();

router.get("/get_products", getAllProducts);

module.exports = router;