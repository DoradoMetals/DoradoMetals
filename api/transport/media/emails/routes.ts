import express from "express";

import { sendPricedEmail } from "#transport/media/emails/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.post("/purchase_order_priced", requireUser, sendPricedEmail);

export default router;
