const express = require("express");
const router = express.Router();
const { getSpotPrices } = require("../controllers/spotController");

router.get("/spot_prices", getSpotPrices);

module.exports = router;