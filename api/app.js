// The Express app, with nothing started.
//
// Split out of server.js so it can be imported by a test. server.js used to
// build the app, start the cron scheduler and listen, all at module load, which
// meant importing it to make one request also started a scheduler and bound a
// port - so the routes and controllers had no tests at all. That is the layer
// where servicesRepo.remove(req.body) lived, and where the transactions
// controller still reads req.body on a GET.
//
// server.js is now the only thing that starts anything.
import "#env";
import express from "express";
import cors from "cors";

import productRoutes from "#features/products/routes.js";
import addressRoutes from "#features/addresses/routes.js";
import purchaseOrderRoutes from "#features/purchase-orders/routes.js";
import checkoutRoutes from "#features/checkout/routes.js";
import pdfRoutes from "#features/pdf/routes.js";
import reviewRoutes from "#features/reviews/routes.js";
import emailRoutes from "#features/emails/routes.js";
import paymentRoutes from "#features/payments/routes.js";
import spotRoutes from "#features/spots/routes.js";
import transactionRoutes from "#features/transactions/routes.js";
import salesOrderRoutes from "#features/sales-orders/routes.js";
import refinerRoutes from "#features/refiners/routes.js";
import taxRoutes from "#features/sales-tax/routes.js";
import carriersRoutes from "#features/shipping/carriers/routes.js";
import recaptchaRoutes from "#features/recaptcha/routes.js";
import userRoutes from "#features/users/routes.js";
import accountRoutes from "#features/auth/routes.js";
import imageRoutes from "#features/media/routes.js";
import leadRoutes from "#features/leads/routes.js";
import rateRoutes from "#features/rates/routes.js";
import shippingRoutes from "#features/shipping/operations/routes.js";
import carrierServiceRoutes from "#features/shipping/services/routes.js";
import fulfillmentRoutes from "#features/fulfillments/routes.js";

import { toNodeHandler } from "better-auth/node";
import { auth } from "#features/auth/client.js";
import { handleStripeWebhook } from "#features/payments/controller.ts";
import errorHandler from "#shared/middleware/errorHandler.ts";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.post(
  "/api/auth/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

// The route stays /api/stripe: the frontend calls it, and renaming a module
// is not a reason to change the API. The feature is payments; the path is
// history, and it moves when the frontend does.
app.use("/api/stripe", paymentRoutes);
app.use("/api/products", productRoutes);
app.use("/api/addresses", addressRoutes);
// The route stays /api/cart: the frontend calls it and renaming the module is
// not a reason to change the API. The feature is checkout; the path is history.
app.use("/api/cart", checkoutRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/spots", spotRoutes);
app.use("/api/purchase_orders", purchaseOrderRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/sales_orders", salesOrderRoutes);
// The route stays /api/suppliers: the frontend calls it
// (frontend/features/products/queries.ts) and renaming a module is not a
// reason to change the API. The feature is refiners; the path is history, and
// it moves when the frontend does.
app.use("/api/suppliers", refinerRoutes);
app.use("/api/tax", taxRoutes);
app.use("/api/recaptcha", recaptchaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/rates", rateRoutes);
app.use("/api/carriers", carriersRoutes);
app.use("/api/carrier_services", carrierServiceRoutes);
app.use("/api/fulfillments", fulfillmentRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use(errorHandler);

export default app;
