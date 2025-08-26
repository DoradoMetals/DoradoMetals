const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const productRoutes = require("./routes/products");
const addressRoutes = require("./routes/addresses");
const cartRoutes = require("./routes/carts");
const sellCartRoutes = require("./routes/sell-carts");
const adminRoutes = require("./routes/admin");
const shippingRoutes = require("./routes/shipping");
const purchaseOrderRoutes = require("./routes/purchase-orders");
const pdfRoutes = require("./routes/pdf");
const reviewRoutes = require("./routes/reviews");
const emailRoutes = require("./routes/emails");
const stripeRoutes = require("./routes/stripe");
const spotRoutes = require("./routes/spots");
const transactionRoutes = require("./routes/transactions");
const salesOrderRoutes = require("./routes/sales-orders");
const supplierRoutes = require("./routes/suppliers");
const taxRoutes = require("./routes/tax");
const carriersRoutes = require("./routes/carriers");
const recaptchaRoutes = require("./routes/recaptcha");
const userRoutes = require("./routes/users");
const imageRoutes = require("./routes/images")
const leadRoutes = require("./routes/leads");

const { toNodeHandler } = require("better-auth/node");
const { auth } = require("./auth");
const { setupScheduler } = require("./services/scheduler");
const pg = require("pg");
const { handleStripeWebhook } = require("./controllers/stripeController");

const types = pg.types;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));

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

setupScheduler();

app.use((req, res, next) => {
  next();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {});
