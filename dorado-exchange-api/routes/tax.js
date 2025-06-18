const express = require("express");
const router = express.Router();

const { requireUser } = require("../middleware/authMiddleware");
const { getSalesTax } = require("../controllers/taxController");

router.post("/get_sales_tax", requireUser, getSalesTax);

module.exports = router;
