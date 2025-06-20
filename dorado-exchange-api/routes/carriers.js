const express = require("express");

const { requireAdmin } = require("../middleware/authMiddleware");
const { getAll } = require("../controllers/carriersController");

const router = express.Router();

router.get("/get_all", requireAdmin, getAll);

module.exports = router;
