import express from "express";

import { getAllSuppliers } from "#features/suppliers/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get_all", requireAdmin, getAllSuppliers);

export default router;
