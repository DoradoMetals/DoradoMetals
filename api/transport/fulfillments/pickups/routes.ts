import express from "express";

import { schedulePickup } from "#transport/fulfillments/pickups/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

// Mounted at / by transport/fulfillments/routes.ts, so the live path is unchanged: POST /api/fulfillments/schedule_pickup. The order-scoped READ is declared by transport/orders/routes.ts, which mounts the handler above.
const router = express.Router();

router.post("/schedule_pickup", requireAdmin, schedulePickup);

export default router;
