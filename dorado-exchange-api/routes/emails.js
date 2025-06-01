const express = require("express");
const {
  sendCreatedEmail,
  sendAcceptedEmail,
} = require("../controllers/emailController");
const { requireUser } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/purchase_order_created", requireUser, sendCreatedEmail);
router.post("/purchase_order_offer_accepted", requireUser, sendAcceptedEmail);

module.exports = router;
