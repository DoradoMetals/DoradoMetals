const { Pool } = require("pg");

// Load environment variables
require("dotenv").config();

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Use Railway DB URL
  ssl: {
    rejectUnauthorized: false, // Required for some cloud-based Postgres providers
  },
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on PostgreSQL:", err);
  process.exit(-1);
});

module.exports = pool;