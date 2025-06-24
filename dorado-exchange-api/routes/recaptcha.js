const express = require("express");
const { verifyRecaptcha } = require("../controllers/recaptchaController");

const router = express.Router();

router.post("/verify-recaptcha", verifyRecaptcha);

module.exports = router;
