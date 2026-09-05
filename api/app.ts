import "#env";
import express from "express";
import cors from "cors";

import productRoutes from "#catalog/products/routes.ts";
import mintRoutes from "#catalog/mints/routes.ts";
import metalRoutes from "#pricing/metals/routes.ts";
import addressRoutes from "#identity/places/addresses/routes.ts";
import { purchaseOrderRoutes, salesOrderRoutes } from "#orders/creates.routes.ts";
import checkoutRowRoutes from "#checkout/checkout.routes.ts";
import pdfRoutes from "#media/pdfs/routes.ts";
import reviewRoutes from "#crm/reviews/routes.ts";
import emailRoutes from "#media/emails/routes.ts";
import paymentRoutes from "#payments/routes.ts";
import paymentMethodRoutes from "#payments/methods/routes.ts";
import spotRoutes from "#pricing/spots/routes.ts";
import transactionRoutes from "#payments/transactions/routes.ts";
import ordersRoutes from "#orders/routes.ts";
import shipmentRoutes from "#logistics/shipping/shipments/routes.ts";
import paymentDetailsRoutes from "#payments/details/routes.ts";
import refinerRoutes from "#orders/refiners/routes.ts";
import refinerItemRoutes from "#orders/refiners/items/routes.ts";
import refinerOrderRoutes from "#orders/refiners/orders/routes.ts";
import carriersRoutes from "#logistics/shipping/carriers/routes.ts";
import recaptchaRoutes from "#identity/recaptcha/routes.ts";
import userRoutes from "#identity/users/routes.ts";
import accountRoutes from "#identity/auth/routes.ts";
import imageRoutes from "#media/images/routes.ts";
import leadRoutes from "#crm/leads/routes.ts";
import rateRoutes from "#pricing/rates/routes.ts";
import quoteRoutes from "#pricing/routes.ts";
import shippingRoutes from "#logistics/shipping/routes.ts";
import carrierServiceRoutes from "#logistics/shipping/services/routes.ts";
import fulfillmentRoutes from "#logistics/fulfillments/routes.ts";

import { toNodeHandler } from "better-auth/node";
import { auth } from "#identity/auth/client.ts";
import { handleStripeWebhook } from "#payments/controller.ts";
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
