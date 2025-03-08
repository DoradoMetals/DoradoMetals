const { betterAuth } = require("better-auth");
const { Pool } = require("pg"); // Import Pool from pg
require("dotenv").config(); // Load env variables
const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  user: {
    modelName: "exchange.users",
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false, // don't allow user to set role
      },
    }
  },
  session: {
    modelName: "exchange.session",
  },
  account: {
    modelName: "exchange.account",
  },
  verification: {
    modelName: "exchange.verification",
  },
  advanced: {
    generateId: false
  },
  emailAndPassword: {
    enabled: true,
    verifyEmail: true,
  },
  trustedOrigins: [process.env.FRONTEND_URL],
});

module.exports = { auth };
