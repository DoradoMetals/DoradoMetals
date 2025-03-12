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

module.exports = pool;