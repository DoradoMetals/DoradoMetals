const express = require("express");
const { getUserAddresses } = require("../controllers/userController");
const authenticateUser = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/addresses", authenticateUser, getUserAddresses);

module.exports = router;