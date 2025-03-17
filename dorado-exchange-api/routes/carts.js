const express = require("express");
const { getCart, syncCart, checkAmountInCart, addToCart, removeFromCart, clearCart } = require("../controllers/cartController");

const router = express.Router();

router.get("/get_cart", getCart);
router.post("/sync_cart", syncCart);
router.get("/check_amount_in_cart", checkAmountInCart);
router.post("/add_to_cart", addToCart);
router.post("/remove_from_cart", removeFromCart);
router.post("/clear_cart", clearCart);

module.exports = router;