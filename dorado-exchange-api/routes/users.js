const express = require("express");
const { getAddresses, deleteAddress, createAndUpdateAddress } = require("../controllers/userController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/get_addresses", requireAuth, getAddresses);
router.post("/create_and_update_address", requireAuth, createAndUpdateAddress);
router.post("/delete_address", requireAuth, deleteAddress);

module.exports = router;
 