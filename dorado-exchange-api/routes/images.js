const express = require("express");

const { requireUser } = require("../middleware/authMiddleware");
const {
  uploadImage,
  getUrl,
  deleteImage,
  getTestImages,
} = require("../controllers/imageController");

const router = express.Router();

router.post("/upload", requireUser, uploadImage);
router.get("/get_test_image", requireUser, getTestImages);
router.get("/get_url", requireUser, getUrl);
router.delete("/delete", requireUser, deleteImage);

module.exports = router;
