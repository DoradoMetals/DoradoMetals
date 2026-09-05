import express from "express";

import {
  addFundsToOrder,
  adminCreateOrder,
  cancelOrder,
  finalizeOrderPricing,
  createOrder,
  createOrderReview,
  getOrder,
  listOrders,
  patchOrder,
  sendOrderToRefiner,
} from "#orders/controller.ts";

import itemRoutes from "#orders/items/routes.ts";
import spotRoutes from "#orders/spots/routes.ts";
import addressRoutes from "#orders/addresses/routes.ts";

import { getRefinerOrderByOrder } from "#orders/refiners/orders/controller.ts";
import { getRefinerItemsByOrder } from "#orders/refiners/items/controller.ts";
import { getRefinerSpotsByOrder } from "#orders/refiners/spots/controller.ts";
import { getFulfillmentByOrder } from "#logistics/fulfillments/controller.ts";
import { getPickupsByOrder } from "#logistics/fulfillments/pickups/controller.ts";
import { getDirectsByOrder } from "#logistics/fulfillments/directs/controller.ts";
import { getShipmentsByOrder } from "#logistics/shipping/shipments/controller.ts";
import { getOrderPaymentDetails } from "#payments/details/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrderParam } from "#shared/middleware/ownership.ts";

const router = express.Router();

router.get("/", requireUser, listOrders);
router.post("/", requireUser, createOrder);
router.post("/admin", requireAdmin, adminCreateOrder);

router.use("/", itemRoutes);
router.use("/", spotRoutes);
router.use("/", addressRoutes);

router.get("/:id", requireUser, requireOwnOrderParam, getOrder);

router.get("/:orderId/fulfillments", requireUser, requireOwnOrderParam, getFulfillmentByOrder);
router.get("/:orderId/shipments", requireUser, requireOwnOrderParam, getShipmentsByOrder);
router.get("/:orderId/pickups", requireAdmin, getPickupsByOrder);
router.get("/:orderId/directs", requireAdmin, getDirectsByOrder);
router.get("/:orderId/payment-details", requireUser, requireOwnOrderParam, getOrderPaymentDetails);
router.get("/:orderId/refiners", requireAdmin, getRefinerOrderByOrder);
router.get("/:orderId/refiners/spots", requireAdmin, getRefinerSpotsByOrder);
router.get("/:orderId/refiners/items", requireAdmin, getRefinerItemsByOrder);

router.post("/:id/review", requireUser, requireOwnOrderParam, createOrderReview);

router.post("/:id/add_funds", requireAdmin, addFundsToOrder);
router.post("/:id/finalize_pricing", requireAdmin, finalizeOrderPricing);
router.post("/:id/cancel", requireAdmin, cancelOrder);
router.post("/:id/send_to_refiner", requireAdmin, sendOrderToRefiner);

router.patch("/:id", requireAdmin, patchOrder);

export default router;
