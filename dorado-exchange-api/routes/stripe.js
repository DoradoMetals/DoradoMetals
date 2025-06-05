const express = require("express");
const router = express.Router();

const {
  retrievePaymentIntent,
  updatePaymentIntent,
} = require("../controllers/stripeController");

const { requireUser } = require("../middleware/authMiddleware");

router.get("/retrieve_payment_intent", requireUser, retrievePaymentIntent);
router.post("/update_payment_intent", requireUser, updatePaymentIntent);

module.exports = router;
