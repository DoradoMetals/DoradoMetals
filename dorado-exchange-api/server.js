const express = require("express");
const cors = require("cors");
const productsRoutes = require("./routes/products");
const emailRoutes = require("./routes/emails");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Use the products route
app.use("/api/products", productsRoutes);
app.use("/api/emails", emailRoutes);

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});