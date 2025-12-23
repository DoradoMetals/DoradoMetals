import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";

import productRoutes from "./routes/products.js";
import addressRoutes from "./addresses/routes.js";
import cartRoutes from "./routes/carts.js";
import sellCartRoutes from "./routes/sell-carts.js";
import adminRoutes from "./routes/admin.js";
import shippingRoutes from "./routes/shipping.js";
import purchaseOrderRoutes from "./routes/purchase-orders.js";
import pdfRoutes from "./routes/pdf.js";
import reviewRoutes from "./routes/reviews.js";
import emailRoutes from "./routes/emails.js";
import stripeRoutes from "./routes/stripe.js";
import spotRoutes from "./routes/spots.js";
import transactionRoutes from "./routes/transactions.js";
import salesOrderRoutes from "./routes/sales-orders.js";
import supplierRoutes from "./routes/suppliers.js";
import taxRoutes from "./routes/tax.js";
import carriersRoutes from "./routes/carriers.js";
import recaptchaRoutes from "./routes/recaptcha.js";
import userRoutes from "./routes/users.js";
import imageRoutes from "./routes/images.js";
import leadRoutes from "./routes/leads.js";
import rateRoutes from "./routes/rates.js";

import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { setupScheduler } from "./services/scheduler.js";
import { handleStripeWebhook } from "./controllers/stripeController.js";

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
app.use("/api/sell_cart", sellCartRoutes);
app.use("/api/spots", spotRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/shipping", shippingRoutes);
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

setupScheduler();

app.use((req, res, next) => next());

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
