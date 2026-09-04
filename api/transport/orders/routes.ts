import express from "express";

import {
  addFundsToOrder,
  cancelOrder,
  finalizeOrderPricing,
  getOrder,
  listOrders,
  patchOrder,
  sendOrderToRefiner,
} from "#transport/orders/controller.ts";

import itemRoutes from "#transport/orders/items/routes.ts";
import spotRoutes from "#transport/orders/spots/routes.ts";
import addressRoutes from "#transport/orders/addresses/routes.ts";

import { getRefinerOrderByOrder } from "#transport/refiners/orders/controller.ts";
import { getRefinerItemsByOrder } from "#transport/refiners/items/controller.ts";
import { getRefinerSpotsByOrder } from "#transport/refiners/spots/controller.ts";
import { getFulfillmentByOrder } from "#transport/fulfillments/controller.ts";
import { getPickupsByOrder } from "#transport/fulfillments/pickups/controller.ts";
import { getDirectsByOrder } from "#transport/fulfillments/directs/controller.ts";
import { getShipmentsByOrder } from "#transport/shipping/shipments/controller.ts";
import { getPayoutsByOrder } from "#transport/payouts/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrderParam } from "#shared/middleware/ownership.ts";

const router = express.Router();

router.get("/", requireUser, listOrders);

router.use("/", itemRoutes);
router.use("/", spotRoutes);
router.use("/", addressRoutes);

router.get("/:id", requireUser, requireOwnOrderParam, getOrder);

router.get("/:orderId/fulfillments", requireUser, requireOwnOrderParam, getFulfillmentByOrder);
router.get("/:orderId/shipments", requireUser, requireOwnOrderParam, getShipmentsByOrder);
router.get("/:orderId/pickups", requireAdmin, getPickupsByOrder);
router.get("/:orderId/directs", requireAdmin, getDirectsByOrder);
router.get("/:orderId/payouts", requireUser, requireOwnOrderParam, getPayoutsByOrder);
router.get("/:orderId/refiners", requireAdmin, getRefinerOrderByOrder);
router.get("/:orderId/refiners/spots", requireAdmin, getRefinerSpotsByOrder);
router.get("/:orderId/refiners/items", requireAdmin, getRefinerItemsByOrder);

router.post("/:id/add_funds", requireAdmin, addFundsToOrder);
router.post("/:id/finalize_pricing", requireAdmin, finalizeOrderPricing);
router.post("/:id/cancel", requireAdmin, cancelOrder);
router.post("/:id/send_to_refiner", requireAdmin, sendOrderToRefiner);

router.patch("/:id", requireAdmin, patchOrder);

export default router;
