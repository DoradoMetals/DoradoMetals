import "dotenv/config";

import { betterAuth } from "better-auth";
import { mikroOrmAdapter } from "better-auth-mikro-orm";
import { getOrm } from "@/db/orm";

import { magicLink, admin } from "better-auth/plugins";
import { stripe as stripePlugin } from "@better-auth/stripe";

import {
  renderAccountCreatedEmail,
  renderVerifyEmail,
  renderChangeEmail,
  renderResetPasswordEmail,
  renderCreateAccountEmail,
} from "@/features/emails/utils/renderEmail";

import stripeClient from "@/providers/stripe/client";
import { sendEmail } from "@/features/emails/utils/sendEmail";

const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  FRONTEND_URL: process.env.FRONTEND_URL!,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
};

const orm = await getOrm();

export const auth = betterAuth({
  database: mikroOrmAdapter(orm),

  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({ user, token }) => {
        const emailUrl = `${env.FRONTEND_URL}/change-email?token=${token}`;
        await sendEmail({
          to: user.email,
          subject: "Approve Email Change",
          html: renderChangeEmail({ firstName: user.name, url: emailUrl }),
        });
      },
    },
  },

  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  advanced: { database: { generateId: false } },

  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, token }) => {
      const emailUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
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
    sendVerificationEmail: async ({ user, token }, request) => {
      const isSignUp = request?.url?.includes("/sign-up");
      const emailUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

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
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },

  trustedOrigins: [env.FRONTEND_URL],

  plugins: [
    magicLink({
      sendMagicLink: async ({ email, token }) => {
        const emailUrl = `${env.FRONTEND_URL}/verify-login?token=${token}`;
        await sendEmail({
          to: email,
          subject: "Your Dorado account is ready",
          html: renderCreateAccountEmail({ firstName: "", url: emailUrl }),
        });
      },
    }),

    admin({
      adminRoles: ["admin"],
      allowImpersonatingAdmins: false,
    }),

    stripePlugin({
      stripeClient,
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
      createCustomerOnSignUp: true,
    }),
  ],
});
