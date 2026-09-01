// The shipping feature's parent router: it MOUNTS its children and declares
// nothing of its own (ruling 26 - a resource owns its own controller and
// routes; the parent composes).
//
// THE PATHS DO NOT CHANGE (ruling 13). `operations` is mounted at "/" because
// its seven routes have always been /api/shipping/get_rates,
// /api/shipping/check_pickup and so on, and factoring a file is never a reason
// to move a URL. It is mounted LAST so that a child with a real prefix gets
// first refusal - express would fall through anyway, since operations declares
// no /handoffs route, but relying on that is relying on the absence of
// something.
//
// The feature's other resources keep their own top-level mounts in app.ts -
// /api/shipments, /api/carriers, /api/carrier_services - because those URLs
// predate the folder and moving them would be a wire change.
import express from "express";

import handoffRoutes from "#features/shipping/handoffs/routes.ts";
import operationRoutes from "#features/shipping/operations/routes.ts";
import tierRoutes from "#features/shipping/tiers/routes.ts";

const router = express.Router();

router.use("/handoffs", handoffRoutes);
router.use("/tiers", tierRoutes);
router.use("/", operationRoutes);

export default router;
