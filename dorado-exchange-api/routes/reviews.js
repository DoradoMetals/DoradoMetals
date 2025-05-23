const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { createReview } = require("../controllers/reviewController");

const router = express.Router();

router.post("/create_review", requireAuth, createReview);

module.exports = router;
 