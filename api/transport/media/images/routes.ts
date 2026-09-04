// REST (D214 item 4): the verb is the METHOD and the image is named once, in
// the path. `/upload`, `/get_test_image`, `/get_url`, `/delete` are gone.
import express from "express";

import {
  uploadImage,
  getUrl,
  deleteImage,
  getTestImages,
} from "#transport/media/images/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.post("/", requireUser, uploadImage);
// requireAdmin, NOT requireUser: this lists EVERY image in the system with a
// presigned download link attached to each one. Behind requireUser, every
// customer's uploaded photo was readable by any of the 75 signed-in
// accounts.
//
// The frontend already treated it as admin-only (a UI guard only, which does
// nothing at the API) - this aligns the API with the frontend's own
// declaration, so nothing a real user can do changes.
//
// Left unscoped rather than filtered to the caller ON PURPOSE: showing an
// admin every image IS what this page is for.
router.get("/", requireAdmin, getTestImages);
router.get("/:id/url", requireUser, getUrl);
router.delete("/:id", requireUser, deleteImage);

export default router;
