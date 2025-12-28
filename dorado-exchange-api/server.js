import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";

import productRoutes from "#features/products/routes.js";
import addressRoutes from "#features/addresses/routes.js";
import purchaseOrderRoutes from "#features/purchase-orders/routes.js";
import cartRoutes from "#features/carts/routes.js";
import pdfRoutes from "#features/pdf/routes.js";
import reviewRoutes from "#features/reviews/routes.js";
import emailRoutes from "#features/emails/routes.js";
import stripeRoutes from "#features/stripe/routes.js";
import spotRoutes from "#features/spots/routes.js";
import transactionRoutes from "#features/transactions/routes.js";
import salesOrderRoutes from "#features/sales-orders/routes.js";
import supplierRoutes from "#features/suppliers/routes.js";
import taxRoutes from "#features/sales-tax/routes.js";
import carriersRoutes from "#features/shipping/carriers/routes.js";
import recaptchaRoutes from "#features/recaptcha/routes.js";
import userRoutes from "#features/users/routes.js";
import imageRoutes from "#features/media/routes.js";
import leadRoutes from "#features/leads/routes.js";
import rateRoutes from "#features/rates/routes.js";
import shippingRoutes from "#features/shipping/operations/routes.js";

import { toNodeHandler } from "better-auth/node";
import { auth } from "#features/auth/client.js";
import { setupScheduler } from "#shared/cron/scheduler.js";
import { handleStripeWebhook } from "#features/stripe/controller.js";
import errorHandler from "#shared/middleware/errorHandler.js";

const { types } = pg;
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));

const app = express();
const PORT = process.env.PORT || 5000;

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

app.use("/api/stripe", stripeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/spots", spotRoutes);
app.use("/api/purchase_orders", purchaseOrderRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/sales_orders", salesOrderRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/tax", taxRoutes);
app.use("/api/carriers", carriersRoutes);
app.use("/api/recaptcha", recaptchaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/rates", rateRoutes);
app.use("/api/shipping", shippingRoutes);

setupScheduler();

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use(errorHandler);

app.listen(PORT, () => {});
