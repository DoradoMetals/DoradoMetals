import express from "express";

import {
  uploadImage,
  getUrl,
  deleteImage,
  getTestImages,
} from "#transport/media/images/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// NO WIRE ADAPTER. Media is the first CONVERTED feature (2026-08-27): the
// frontend types derive from @dorado/contracts and read the schema's own
// names, so there is no legacy shape left to convert down to. The adapter and
// its mount were deleted together - this comment is the tombstone that
// explains why media looks different from the features still awaiting
// conversion.

router.post("/upload", requireUser, uploadImage);
// requireAdmin, NOT requireUser. This lists EVERY image in the system - the
// repo call is `SELECT ... FROM exchange.images` with no user scoping - and
// attaches a presigned GET URL to each one, which is a working download link
// for the file. Behind requireUser that made every customer's uploaded photo
// readable by any of the 75 signed-in accounts.
//
// The frontend already treated it as admin-only: /images declares
// roles: ['admin'] and is titled "Image Test". The guard was in the UI, which
// is not where a guard does anything - the endpoint answers a request whether a
// page asked for it or not. This aligns the API with the frontend's own
// declaration, so nothing a real user can do changes.
//
// Left unscoped rather than filtered to the caller ON PURPOSE: showing an admin
// every image IS what this page is for. The scoping fix would have been the
// right one had the page been a customer's own gallery.
router.get("/get_test_image", requireAdmin, getTestImages);
router.get("/get_url", requireUser, getUrl);
router.delete("/delete", requireUser, deleteImage);

export default router;
