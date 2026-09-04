import express from "express";

import handoffRoutes from "#transport/shipping/handoffs/routes.ts";
import packageRoutes from "#transport/shipping/packages/routes.ts";
import operationRoutes from "#transport/shipping/operations/routes.ts";

const router = express.Router();

router.use("/handoffs", handoffRoutes);
router.use("/packages", packageRoutes);
router.use("/", operationRoutes);

export default router;
