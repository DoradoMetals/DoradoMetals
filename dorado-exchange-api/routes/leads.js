const express = require("express");
const {
  getOne,
  getAll,
  createLead,
  updateLead,
  deleteLead,
} = require("../controllers/leadsController");

const { requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", requireAdmin, getAll);
router.post("/create", requireAdmin, createLead);
router.post("/update", requireAdmin, updateLead);
router.delete("/delete", requireAdmin, deleteLead);

module.exports = router;
