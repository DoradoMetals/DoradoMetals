const express = require("express");
const { getCart, syncCart, checkAmountInCart, addToCart, removeFromCart, clearCart, removeItemFromCart } = require("../controllers/cartController");

const router = express.Router();

router.get("/get_cart", getCart);
router.post("/sync_cart", syncCart);
router.post("/add_to_cart", addToCart);
router.post("/remove_from_cart", removeFromCart);
router.post("/remove_item_from_cart", removeItemFromCart);
router.post("/clear_cart", clearCart);

module.exports = router;