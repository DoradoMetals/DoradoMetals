const express = require("express");
const { requireUser } = require("../middleware/authMiddleware");
const {
  getTransactionHistory,
} = require("../controllers/transactionController");

const router = express.Router();

router.get("/get_transactions", requireUser, getTransactionHistory);

module.exports = router;
