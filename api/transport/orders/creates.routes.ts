// THE TWO LEGACY CREATE NAMESPACES: /api/purchase_orders and /api/sales_orders.
//
// Those features are gone - direction is a COLUMN - but THE PATHS DO NOT CHANGE
// in this pass (the REST rewrite is its own, docs/waves/rest-routes.md), so
// this file declares both routers and app.ts mounts each where it always did.
//
// ALL THREE CREATE PATHS NOW REACH ONE HANDLER WITH ONE BODY, `{ checkout_id }`
// (D214 item 11). They used to be three: a zero-body purchase create that read
// the caller's own checkout, a customer sale create that took the browser's
// whole checkout document, and an admin sale create that took the same document
// plus the customer. The checkout row names its own customer, so the admin door
// and the customer door differ only in whose checkout may be named - which is
// an authorization question, asked in the controller.
import express from "express";

import {
  createOrderFromCheckout,
  createOrderReview,
} from "#transport/orders/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
// requireUser asks whether somebody is signed in; this asks whether the order
// is theirs. It reads the order id out of the request BODY, which is where the
// review flag carries it.
import { requireOwnOrder } from "#shared/middleware/ownership.ts";

// ------------------------------------------------- /api/purchase_orders
export const purchaseOrderRoutes = express.Router();

purchaseOrderRoutes.post("/create_from_checkout", requireUser, createOrderFromCheckout);
purchaseOrderRoutes.post("/create_review", requireUser, requireOwnOrder, createOrderReview);

// ---------------------------------------------------- /api/sales_orders
export const salesOrderRoutes = express.Router();

// THE BUY FLOW IS OPEN TO CUSTOMERS AGAIN (Jacob, 2026-09-04). It had been
// requireAdmin since 26 August "while sales-order checkout is off", and the
// reopening is the one-word change that comment promised - but the effect was
// larger than it read: the customer buy checkout runs all the way to Stripe
// and then 403s on the last click, because THIS is the route it posts to.
//
// WHO MAY PLACE WHAT IS ALREADY DECIDED, one layer down and correctly, so
// nothing else moves: createOrderFromCheckout refuses a checkout that is not
// the caller's own unless they are an admin, and place() refuses an anonymous
// subject through assertRealAccount (ruling 63 - a visitor may shop and may
// not buy). requireUser is the guard that lets those two rules be reached.
salesOrderRoutes.post("/create_sales_order", requireUser, createOrderFromCheckout);

// The named-user path stays admin-only: it is the same handler, and what makes
// it "admin" is that the checkout it names belongs to somebody else.
salesOrderRoutes.post("/admin_create_sales_order", requireAdmin, createOrderFromCheckout);

salesOrderRoutes.post("/create_review", requireUser, requireOwnOrder, createOrderReview);
