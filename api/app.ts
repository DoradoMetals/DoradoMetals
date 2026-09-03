// The Express app, with nothing started — split out of server.ts so it can be imported by a test; server.ts used to build the app, start the cron scheduler and listen all at module load, so importing it for one request also bound a port and started a scheduler, meaning routes and controllers had no tests at all.
// server.ts is now the only thing that starts anything.
import "#env";
import express from "express";
import cors from "cors";

import productRoutes from "#transport/products/routes.ts";
import addressRoutes from "#transport/places/addresses/routes.ts";
import { purchaseOrderRoutes, salesOrderRoutes } from "#transport/orders/creates.routes.ts";
import checkoutRowRoutes from "#transport/checkout/checkout.routes.ts";
import pdfRoutes from "#transport/media/pdfs/routes.ts";
import reviewRoutes from "#transport/reviews/routes.ts";
import emailRoutes from "#transport/media/emails/routes.ts";
import paymentRoutes from "#transport/payments/routes.ts";
import paymentMethodRoutes from "#transport/payments/methods/routes.ts";
import spotRoutes from "#transport/spots/routes.ts";
import transactionRoutes from "#transport/transactions/routes.ts";
import ordersRoutes from "#transport/orders/routes.ts";
import shipmentRoutes from "#transport/shipping/shipments/routes.ts";
import payoutRoutes from "#transport/payouts/routes.ts";
import refinerRoutes from "#transport/refiners/routes.ts";
import refinerItemRoutes from "#transport/refiners/items/routes.ts";
import refinerOrderRoutes from "#transport/refiners/orders/routes.ts";
import taxRoutes from "#transport/sales-tax/routes.ts";
import carriersRoutes from "#transport/shipping/carriers/routes.ts";
import recaptchaRoutes from "#transport/recaptcha/routes.ts";
import userRoutes from "#transport/users/routes.ts";
import accountRoutes from "#transport/auth/routes.ts";
import imageRoutes from "#transport/media/images/routes.ts";
import leadRoutes from "#transport/leads/routes.ts";
import rateRoutes from "#transport/rates/routes.ts";
import quoteRoutes from "#transport/quotes/routes.ts";
import shippingRoutes from "#transport/shipping/routes.ts";
import carrierServiceRoutes from "#transport/shipping/services/routes.ts";
import fulfillmentRoutes from "#transport/fulfillments/routes.ts";

import { toNodeHandler } from "better-auth/node";
import { auth } from "#domain/auth/client.ts";
import { handleStripeWebhook } from "#transport/payments/controller.ts";
import errorHandler from "#shared/middleware/errorHandler.ts";
import { httpLogger } from "#shared/logging/http.ts";

const app = express();

// One structured line per request (method, path, status, duration, req id) -
// and nothing else; bodies never reach a log. See shared/logging/logger.ts.
app.use(httpLogger);

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    // PATCH is here because the order mutation surface is PATCH-based — a browser preflights it, and a missing method here 403s every real client while the server-side route still works.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.post(
  "/api/auth/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

// *splat, not *: express 5's path-to-regexp requires named wildcards, and a
// bare * throws at mount time.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());
// express 5 leaves req.body undefined when nothing matched (v4 gave {}) — without this, a POST with a missing/mistyped content-type would 500 on the destructure instead of failing validation normally.
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// Route stays /api/stripe — the frontend calls it, and renaming a module isn't a reason to change the API; the new methods resource gets the honest name instead.
app.use("/api/stripe", paymentRoutes);
app.use("/api/payments/methods", paymentMethodRoutes);
app.use("/api/products", productRoutes);
app.use("/api/addresses", addressRoutes);
// /api/cart is GONE (ruling 50): the basket is /api/checkout/items.
app.use("/api/checkout", checkoutRowRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/spots", spotRoutes);
app.use("/api/purchase_orders", purchaseOrderRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/sales_orders", salesOrderRoutes);
// The per-resource mutation surface (28 August): the unified order writes,
// a parcel's money and tracking, a payout's cost and method - each owned by
// the feature that owns the table.
app.use("/api/orders", ordersRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/payouts", payoutRoutes);
// Route stays /api/suppliers for the same reason — the frontend calls it directly.
app.use("/api/suppliers", refinerRoutes);
// The refiner-side WRITES are new (28 August) and take the feature's real
// name - only the historical read path above keeps the suppliers spelling.
app.use("/api/refiners", refinerItemRoutes);
app.use("/api/refiners", refinerOrderRoutes);
app.use("/api/tax", taxRoutes);
app.use("/api/recaptcha", recaptchaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/rates", rateRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/carriers", carriersRoutes);
app.use("/api/carrier_services", carrierServiceRoutes);
app.use("/api/fulfillments", fulfillmentRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use(errorHandler);

export default app;
