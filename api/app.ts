import "#env";
import express from "express";
import cors from "cors";

import productRoutes from "#transport/products/routes.ts";
import mintRoutes from "#transport/mints/routes.ts";
import metalRoutes from "#transport/metals/routes.ts";
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
import paymentDetailsRoutes from "#transport/payments/details/routes.ts";
import refinerRoutes from "#transport/refiners/routes.ts";
import refinerItemRoutes from "#transport/refiners/items/routes.ts";
import refinerOrderRoutes from "#transport/refiners/orders/routes.ts";
import carriersRoutes from "#transport/shipping/carriers/routes.ts";
import recaptchaRoutes from "#transport/recaptcha/routes.ts";
import userRoutes from "#transport/users/routes.ts";
import accountRoutes from "#transport/auth/routes.ts";
import imageRoutes from "#transport/media/images/routes.ts";
import leadRoutes from "#transport/leads/routes.ts";
import rateRoutes from "#transport/rates/routes.ts";
import quoteRoutes from "#transport/pricing/routes.ts";
import shippingRoutes from "#transport/shipping/routes.ts";
import carrierServiceRoutes from "#transport/shipping/services/routes.ts";
import fulfillmentRoutes from "#transport/fulfillments/routes.ts";

import { toNodeHandler } from "better-auth/node";
import { auth } from "#domain/auth/client.ts";
import { handleStripeWebhook } from "#transport/payments/controller.ts";
import errorHandler from "#shared/middleware/errorHandler.ts";
import { httpLogger } from "#shared/logging/http.ts";

const app = express();

app.use(httpLogger);

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.post(
  "/api/auth/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.use("/api/stripe", paymentRoutes);
app.use("/api/payments/methods", paymentMethodRoutes);
app.use("/api/products", productRoutes);
app.use("/api/mints", mintRoutes);
app.use("/api/metals", metalRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/checkout", checkoutRowRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/spots", spotRoutes);
app.use("/api/purchase_orders", purchaseOrderRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/sales_orders", salesOrderRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/payments/details", paymentDetailsRoutes);
app.use("/api/suppliers", refinerRoutes);
app.use("/api/refiners", refinerItemRoutes);
app.use("/api/refiners", refinerOrderRoutes);
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
