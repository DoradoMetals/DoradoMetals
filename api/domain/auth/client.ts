import { requiredEnv } from "#shared/env/required.ts";
import "#env";
import { betterAuth } from 'better-auth';
import { magicLink, admin, anonymous } from 'better-auth/plugins';
import { stripe as stripePlugin } from '@better-auth/stripe';
import { Pool } from 'pg';

import stripeClient from '#providers/payment/stripe-client.ts';
import { fillMissingRole, withoutAnonymousCustomers } from '#domain/auth/anonymous.ts';
import { adoptAnonymousCheckoutQuietly } from '#domain/checkout/adopt.ts';
import { sendEmail } from '#providers/emails/nodemailer.ts';
import { sendAuthVerificationEmail } from '#domain/media/emails/service.ts';
import {
  renderChangeEmail,
  renderResetPasswordEmail,
  renderCreateAccountEmail,
} from '#domain/media/emails/utils/renderEmail.ts';

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  user: {
    modelName: 'auth.users',
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'user', input: false },
      stripeCustomerId: { type: 'string', required: false, input: false },
      dorado_funds: { type: 'number', required: false, defaultValue: 0, input: false },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, token }) => {
        const emailUrl = `${requiredEnv("FRONTEND_URL")}/change-email?token=${token}`;
        await sendEmail({
          to: user.email,
          subject: 'Approve Email Change',
          html: renderChangeEmail({ firstName: user.name, url: emailUrl }),
        });
      },
    },
  },
  session: {
    modelName: 'auth.sessions',
    additionalFields: {
      impersonatedBy: { type: 'string', required: false, defaultValue: null, input: false },
    },
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  account: { modelName: 'auth.account' },
  verification: { modelName: 'auth.verification' },
  advanced: { database: { generateId: false } },
  // THE DEFAULT ROLE, applied where every create goes past. The anonymous
  // plugin calls internalAdapter.createUser directly, which skips the
  // additionalFields defaults the sign-up ROUTE applies - so without this a
  // visitor has role NULL and authMiddleware refuses every checkout route they
  // touch. domain/auth/anonymous.ts carries the full reasoning.
  databaseHooks: {
    user: { create: { before: async (user) => fillMissingRole(user) } },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, token }) => {
      const emailUrl = `${requiredEnv("FRONTEND_URL")}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset Your Password',
        html: renderResetPasswordEmail({ firstName: user.name, url: emailUrl }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }, request) => {
      await sendAuthVerificationEmail({
        user,
        url: `${requiredEnv("FRONTEND_URL")}/verify-email?token=${token}`,
        isSignUp: request?.url?.includes('/sign-up') ?? false,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  trustedOrigins: [process.env.FRONTEND_URL as string],
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, token }) => {
        const emailUrl = `${requiredEnv("FRONTEND_URL")}/verify-login?token=${token}`;
        await sendEmail({
          to: email,
          subject: 'Your Dorado account is ready',
          html: renderCreateAccountEmail({ firstName: '', url: emailUrl }),
        });
      },
    }),

    admin(),

    // A VISITOR IS A USER (ruling 63: "Fuck it, go for it. We'll need it
    // anyway." / "Frontend stores should be for UI elements, not data."). The
    // browser keeps no basket: the first touch mints an anonymous auth.users
    // row and the checkout is ordinary rows under an ordinary id, so rates,
    // quotes and readiness are the same code for a visitor as for a customer.
    anonymous({
      // The address is never deliverable and must never look like it is.
      // .invalid is reserved by RFC 2606 and cannot resolve, so a visitor's
      // address can never collide with a real one and can never be mailed.
      emailDomainName: 'anonymous.dorado.invalid',

      // THE BASKET FOLLOWS THE CUSTOMER. better-auth calls this after a
      // sign-in or sign-up that had an anonymous session, with both
      // identities; adopt.ts re-keys the checkout rows, their lines and the
      // address book onto the real account. It never throws: an exception here
      // is a customer who cannot sign in, and a basket is device-sync, not a
      // ledger.
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await adoptAnonymousCheckoutQuietly({
          anonymousUserId: anonymousUser.user.id,
          userId: newUser.user.id,
        });
      },

      // THE PLUGIN DOES NOT DELETE THE VISITOR; the sweep does
      // (domain/checkout/sweep.ts, on the cron).
      //
      // Left to itself the plugin deletes the anonymous user in the same
      // response hook, immediately after onLinkAccount. Every foreign key onto
      // auth.users is NO ACTION, so ONE row still pointing at that visitor -
      // an address link, a draft fulfillment, anything a later feature adds -
      // turns a customer's SIGN-IN into a 500. That is the worst place in the
      // application to put a failure that only appears in production data.
      // Deferring the delete to a sweep converts that whole class of bug from
      // "a customer cannot get into their account" into "a row lingers for
      // another seven days", which is the trade every time.
      disableDeleteAnonymousUser: true,
    }),

    // The stripe plugin, with its user-create hook skipped for visitors:
    // createCustomerOnSignUp would otherwise mint a Stripe customer - and spend
    // two Stripe round-trips inside the request - for every visitor who touches
    // a basket. domain/auth/anonymous.ts carries the reasoning and the test
    // that pins it to @better-auth/stripe's own build.
    withoutAnonymousCustomers(stripePlugin({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET as string,
      createCustomerOnSignUp: true,
    })),
  ],
});
