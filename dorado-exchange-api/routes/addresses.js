const express = require("express");
const { getAddresses, createAndUpdateAddress, deleteAddress, setDefaultAddress } = require("../controllers/addressController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/get_addresses", requireAuth, getAddresses);
router.post("/create_and_update_address", requireAuth, createAndUpdateAddress);
router.delete("/delete_address", requireAuth, deleteAddress);
router.post("/set_default_address", requireAuth, setDefaultAddress);

module.exports = router;
 