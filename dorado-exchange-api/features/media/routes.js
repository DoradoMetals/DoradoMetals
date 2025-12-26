import express from "express";

import {
  uploadImage,
  getUrl,
  deleteImage,
  getTestImages,
} from "#features/media/controller.js";

import { requireUser } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.post("/upload", requireUser, uploadImage);
router.get("/get_test_image", requireUser, getTestImages);
router.get("/get_url", requireUser, getUrl);
router.delete("/delete", requireUser, deleteImage);

export default router;
