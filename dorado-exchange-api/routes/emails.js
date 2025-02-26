const express = require("express");
const { subscribeEmail } = require("../controllers/emailController");

const router = express.Router();

// POST route to subscribe email
router.post("/subscribe", subscribeEmail);

module.exports = router;