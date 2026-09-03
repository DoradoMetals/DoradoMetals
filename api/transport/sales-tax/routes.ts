import express from "express";

import { getSalesTax } from "#transport/sales-tax/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.ts";
const router = express.Router();

router.post("/get_sales_tax", requireUser, getSalesTax);

export default router;
