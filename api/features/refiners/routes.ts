import express from "express";

import { getAllRefiners } from "#features/refiners/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.ts";
import * as refinersWire from "#features/refiners/wire.ts";
import { wireShape } from "#shared/wire/middleware.ts";

const router = express.Router();

// The wire adapter, mounted once for the whole feature rather than called by
// hand in every handler - no writes take this entity, so only the response is converted. Controllers return the internal shape
// and know nothing about the frontend not having caught up. Deleting the
// adapter is deleting this line.
router.use(wireShape(refinersWire, { body: false }));

router.get("/get_all", requireAdmin, getAllRefiners);

export default router;
