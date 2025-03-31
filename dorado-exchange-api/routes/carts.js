const express = require("express");
const { getCart, syncCart } = require("../controllers/cartController");

const router = express.Router();

router.get("/get_cart", getCart);
router.post("/sync_cart", syncCart);

module.exports = router;