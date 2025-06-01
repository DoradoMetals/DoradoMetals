const express = require("express");

const {
  getAddresses,
  createAndUpdateAddress,
  deleteAddress,
  setDefaultAddress,
} = require("../controllers/addressController");

const { requireUser } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/get_addresses", requireUser, getAddresses);
router.post("/create_and_update_address", requireUser, createAndUpdateAddress);
router.delete("/delete_address", requireUser, deleteAddress);
router.post("/set_default_address", requireUser, setDefaultAddress);

module.exports = router;
