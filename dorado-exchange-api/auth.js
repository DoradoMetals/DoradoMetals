const { betterAuth } = require("better-auth");
const { Pool } = require("pg"); // Import Pool from pg
const { sendEmail } = require("./email");

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
    generateId: false,
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url, token }, request) => {
      await sendEmail({
          to: user.email,
          subject: 'Reset your password',
          text: `Click the link to reset your password: ${process.env.FRONTEND_URL}/reset-password?token=${token}`,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ( { user, url, token }, request) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email address",
        text: `Click the link to verify your email: ${process.env.FRONTEND_URL}/verify-email?token=${token}`,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  trustedOrigins: [process.env.FRONTEND_URL],
});

module.exports = { auth };
