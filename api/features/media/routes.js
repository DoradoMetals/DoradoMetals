import express from "express";

import {
  uploadImage,
  getUrl,
  deleteImage,
  getTestImages,
} from "#features/media/controller.js";

import { requireUser } from "#shared/middleware/authMiddleware.js";
import * as mediaWire from "#features/media/wire.js";
import { wireShape } from "#shared/wire/middleware.js";

const router = express.Router();

// The wire adapter, mounted once for the whole feature rather than called by
// hand in every handler - the body IS the entity on writes. Controllers return the internal shape
// and know nothing about the frontend not having caught up. Deleting the
// adapter is deleting this line.
router.use(wireShape(mediaWire));

router.post("/upload", requireUser, uploadImage);
router.get("/get_test_image", requireUser, getTestImages);
router.get("/get_url", requireUser, getUrl);
router.delete("/delete", requireUser, deleteImage);

export default router;
