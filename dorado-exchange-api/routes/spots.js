const express = require("express");
const router = express.Router();
const { getSpotPrices, updateScrapPercentages } = require("../controllers/spotController");

router.get("/spot_prices", getSpotPrices);
router.post('/update_scrap_percentage', updateScrapPercentages);

module.exports = router;