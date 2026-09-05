import express from "express";

import {
  getPaymentDetails, getPaymentDetailsBank, patchPaymentDetails,
} from "#payments/details/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.get("/:id", requireAdmin, getPaymentDetails);

router.patch("/:id", requireAdmin, patchPaymentDetails);

router.get("/:id/bank", requireAdmin, getPaymentDetailsBank);

export default router;
