const express = require("express");
const { requireUser } = require("../middleware/authMiddleware");
const { createReview } = require("../controllers/reviewController");

const router = express.Router();

router.post("/create_review", requireUser, createReview);

module.exports = router;
 