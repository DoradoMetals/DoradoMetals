const express = require("express");

const { requireAdmin } = require("../middleware/authMiddleware");
const {
  getAll,
  getUser,
  getAdmins,
  updateCredit,
} = require("../controllers/usersController");

const router = express.Router();

router.get("/get_user", requireAdmin, getUser);
router.get("/get_all_users", requireAdmin, getAll);
router.get("/get_admin_users", requireAdmin, getAdmins);
router.post("/update_credit", requireAdmin, updateCredit);

module.exports = router;
