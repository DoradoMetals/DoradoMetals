const express = require("express");
const { getSellCart, syncSellCart } = require("../controllers/sellCartController");

const router = express.Router();

router.get("/get_sell_cart", getSellCart);
router.post("/sync_sell_cart", syncSellCart);

module.exports = router;