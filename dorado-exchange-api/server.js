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

const spotRoutes = require("./routes/spots");
const { toNodeHandler } = require("better-auth/node");
const { auth } = require("./auth");
const { setupScheduler } = require("./services/scheduler");
const pg = require("pg");
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

//Mount BetterAuth authentication routes
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

// Use the products and email routes
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

setupScheduler();

app.use((req, res, next) => {
  next();
});

app.listen(PORT, () => {});
