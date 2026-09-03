import express from "express";

import { getTransactionHistory } from "#transport/transactions/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.get("/get_transactions", requireUser, getTransactionHistory);

export default router;
