import express from "express";

import { getAllSuppliers } from "#features/suppliers/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";
import * as suppliersWire from "#features/suppliers/wire.js";
import { wireShape } from "#shared/wire/middleware.js";

const router = express.Router();

// The wire adapter, mounted once for the whole feature rather than called by
// hand in every handler - no writes take this entity, so only the response is converted. Controllers return the internal shape
// and know nothing about the frontend not having caught up. Deleting the
// adapter is deleting this line.
router.use(wireShape(suppliersWire, { body: false }));

router.get("/get_all", requireAdmin, getAllSuppliers);

export default router;
