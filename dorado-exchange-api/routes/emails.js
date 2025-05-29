const express = require("express");
const {
  sendCreatedEmail,
  sendAcceptedEmail,
} = require("../controllers/emailController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/purchase_order_created", requireAuth, sendCreatedEmail);
router.post("/purchase_order_offer_accepted", requireAuth, sendAcceptedEmail);

module.exports = router;
