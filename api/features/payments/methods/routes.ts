import express from "express";

import { getMethods } from "#features/payments/methods/controller.ts";

// Mounted at /api/payments/methods by app.ts - NOT under /api/stripe. The
// parent's path is history (its comment says so); a resource minted today
// gets the honest name, and payment methods are the business's, not Stripe's.
//
// PUBLIC, deliberately: the product page and the payout landing page render
// these rows to signed-out visitors, exactly as the hardcoded arrays they
// replace did. Fees, delays and marketing copy - nothing here is anyone's.
const router = express.Router();

router.get("/", getMethods);

export default router;
