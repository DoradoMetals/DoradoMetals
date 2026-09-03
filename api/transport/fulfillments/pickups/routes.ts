import express from "express";

import { schedulePickup } from "#transport/fulfillments/pickups/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

// MOUNTED AT / BY features/fulfillments/routes.ts, so the live path is
// unchanged: POST /api/fulfillments/schedule_pickup (ruling 13). The
// order-scoped READ is declared by features/orders/routes.ts, which mounts the
// handler above - reads resolve from the parent path.
const router = express.Router();

router.post("/schedule_pickup", requireAdmin, schedulePickup);

export default router;
