import express from "express";

import { getTransactionHistory } from "#features/transactions/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get_transactions", requireUser, getTransactionHistory);

export default router;
