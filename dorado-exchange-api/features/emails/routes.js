import express from "express";

import {
  sendCreatedEmail,
  sendAcceptedEmail,
} from "#features/emails/controller.js";

import { requireUser } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.post("/purchase_order_created", requireUser, sendCreatedEmail);
router.post("/purchase_order_offer_accepted", requireUser, sendAcceptedEmail);

export default router;
