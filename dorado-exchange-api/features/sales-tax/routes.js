import express from "express";

import { getSalesTax } from "#features/sales-tax/controller.js";

import { requireUser } from "#shared/middleware/authMiddleware.js";
const router = express.Router();

router.post("/get_sales_tax", requireUser, getSalesTax);

export default router;
