const express = require("express");
const router = express.Router();
const { handleStripeWebhook } = require("../controllers/stripeController");

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

module.exports = router;