const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const productRoutes = require("./routes/products");
const emailRoutes = require("./routes/emails");
const addressRoutes = require("./routes/addresses");
const cartRoutes = require("./routes/carts");
const sellCartRoutes = require("./routes/sell-carts");

const spotRoutes = require("./routes/spots");
const { toNodeHandler } = require("better-auth/node"); // Import BetterAuth middleware
const { auth } = require("./auth"); // Import your BetterAuth instance
const { setupScheduler } = require("./services/scheduler");

dotenv.config(); // Load environment variables
 
const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL, // Replace with your frontend's origin
    methods: ["GET", "POST", "PUT", "DELETE"], // Specify allowed HTTP methods
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  })
);

//Mount BetterAuth authentication routes
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

// Use the products and email routes
app.use("/api/products", productRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/sell_cart", sellCartRoutes);
app.use("/api/spots", spotRoutes);

setupScheduler(); // <--- 🔥 Starts your cron job

app.use((req, res, next) => {
  next();
});

app.listen(PORT, () => {
});
