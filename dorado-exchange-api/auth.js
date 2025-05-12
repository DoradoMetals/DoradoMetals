const { betterAuth } = require("better-auth");
const { Pool } = require("pg");
const { sendEmail } = require("./emails/sendEmail");
const {
  renderAccountCreatedEmail,
  renderVerifyEmail,
  renderChangeEmail,
  renderResetPasswordEmail,
} = require("./emails/renderEmail");

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
});

module.exports = { auth };
