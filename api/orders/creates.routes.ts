import express from "express";

import {
  createOrderFromCheckout,
  createOrderReview,
} from "#orders/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrder } from "#shared/middleware/ownership.ts";

export const purchaseOrderRoutes = express.Router();

purchaseOrderRoutes.post("/create_from_checkout", requireUser, createOrderFromCheckout);
purchaseOrderRoutes.post("/create_review", requireUser, requireOwnOrder, createOrderReview);

export const salesOrderRoutes = express.Router();

salesOrderRoutes.post("/create_sales_order", requireUser, createOrderFromCheckout);

salesOrderRoutes.post("/admin_create_sales_order", requireAdmin, createOrderFromCheckout);

salesOrderRoutes.post("/create_review", requireUser, requireOwnOrder, createOrderReview);
