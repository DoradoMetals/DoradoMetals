const { betterAuth } = require("better-auth");
const { stripe } = require("@better-auth/stripe");
const { stripeClient } = require("./stripe")
const { Pool } = require("pg");
const { sendEmail } = require("./emails/sendEmail");
const {
  renderAccountCreatedEmail,
  renderVerifyEmail,
  renderChangeEmail,
  renderResetPasswordEmail,
  renderCreateAccountEmail,
} = require("./emails/renderEmail");

const { magicLink, admin } = require("better-auth/plugins");

require("dotenv").config();

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
        input: false,
      },
      stripeCustomerId: {
        type: "string",
        required: false,
        input: false,
      },
      dorado_funds: {
        type: "number",
        required: false,
        defaultValue: 0,
        input: false,
      }
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async (
        { user, newEmail, url, token },
        request
      ) => {
        const emailUrl = `${process.env.FRONTEND_URL}/change-email?token=${token}`;
        await sendEmail({
          to: user.email,
          subject: "Approve Email Change",
          html: renderChangeEmail({ firstName: user.name, url: emailUrl }),
        });
      },
    },
  },
  session: {
    modelName: "exchange.session",
    additionalFields: {
      impersonatedBy: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
      },
    },
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  account: {
    modelName: "exchange.account",
  },
  verification: {
    modelName: "exchange.verification",
  },
  advanced: {
    database: {
      generateId: false,
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url, token }, request) => {
      const emailUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Reset Your Password",
        html: renderResetPasswordEmail({ firstName: user.name, url: emailUrl }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      const isSignUp = request?.url?.includes("/sign-up");
      const emailUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

      await sendEmail({
        to: user.email,
        subject: isSignUp
          ? "Welcome to Dorado Metals Exchange"
          : "Verify Your Email Address",
        text: `Click the link to verify your email: ${emailUrl}`,
        html: isSignUp
          ? renderAccountCreatedEmail({ firstName: user.name, url: emailUrl })
          : renderVerifyEmail({ firstName: user.name, url: emailUrl }),
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
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, token, url }, request) => {
        const emailUrl = `${process.env.FRONTEND_URL}/verify-login?token=${token}`;
        await sendEmail({
          to: email,
          subject: "Your Dorado account is ready",
          html: renderCreateAccountEmail({ firstName: "", url: emailUrl }),
        });
      },
    }),
    admin({
      canImpersonate: async ({ user }) => {
        return user.role === "admin";
      },
    }),
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      createCustomerOnSignUp: true,
    }),
  ],
});

module.exports = { auth };
