const { Pool } = require("pg");

// Load environment variables
require("dotenv").config();

// Create a connection pool
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT || 5432, // Default Postgres port
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on PostgreSQL:", err);
  process.exit(-1);
});

module.exports = pool;