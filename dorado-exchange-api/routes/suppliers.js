const express = require("express");
const router = express.Router();

const { getAllSuppliers } = require("../controllers/supplierController");

const { requireAdmin } = require("../middleware/authMiddleware");

router.get("/get_all", requireAdmin, getAllSuppliers);

module.exports = router;
