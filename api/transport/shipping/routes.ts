// The shipping feature's parent router: mounts its children, declares nothing of its own.
// operations is mounted at "/" (its routes have always been /api/shipping/...) and LAST, so a child with a real prefix gets first refusal.
// carriers/services/shipments keep their own top-level mounts in app.ts (/api/shipments etc.) - those URLs predate this folder.
import express from "express";

import handoffRoutes from "#transport/shipping/handoffs/routes.ts";
import packageRoutes from "#transport/shipping/packages/routes.ts";
import operationRoutes from "#transport/shipping/operations/routes.ts";

const router = express.Router();

router.use("/handoffs", handoffRoutes);
router.use("/packages", packageRoutes);
router.use("/", operationRoutes);

export default router;
