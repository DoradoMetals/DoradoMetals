import { requiredEnv } from "#shared/env/required.ts";
import "#env";
import { betterAuth } from 'better-auth';
import { magicLink, admin } from 'better-auth/plugins';
import { stripe as stripePlugin } from '@better-auth/stripe';
import { Pool } from 'pg';

import stripeClient from '#providers/payment/stripe-client.ts';
import { sendEmail } from '#providers/emails/nodemailer.ts';
import { sendAuthVerificationEmail } from '#features/media/emails/service.ts';
import {
  renderChangeEmail,
  renderResetPasswordEmail,
  renderCreateAccountEmail,
} from '#features/media/emails/utils/renderEmail.ts';

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  user: {
    modelName: 'exchange.users',
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'user', input: false },
      stripeCustomerId: { type: 'string', required: false, input: false },
      dorado_funds: { type: 'number', required: false, defaultValue: 0, input: false },
    },
    changeEmail: {
      enabled: true,
      // sendChangeEmailConfirmation, NOT sendChangeEmailVerification.
      //
      // better-auth has never had an option by the second name, so this object
      // key was read by nothing and this callback was never called. It does not
      // fail: update-user.mjs computes
      //   canSendConfirmation = emailVerified && changeEmail.sendChangeEmailConfirmation
      // which was falsy, falls past it, and lands on the emailVerification
      // branch instead - which sends the ordinary "Verify Your Email Address"
      // mail to `{...user, email: newEmail}`, the NEW address.
      //
      // So the approval went to the address being moved TO, and the address
      // being moved FROM was never told. frontend/app/change-email/page.tsx
      // exists and is documented as "reached from the email-change
      // confirmation link" - a page nothing could reach, because the link that
      // points at it was never sent.
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
    modelName: 'exchange.session',
    additionalFields: {
      impersonatedBy: { type: 'string', required: false, defaultValue: null, input: false },
    },
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  account: { modelName: 'exchange.account' },
  verification: { modelName: 'exchange.verification' },
  advanced: { database: { generateId: false } },
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
    // The one auth mail on the paper trail (D78, migration 091). better-auth
    // only calls this callback - the render, the send and now the
    // media.emails record are all ours, in the shared sender. The reset,
    // change-email and magic-link mails below still go unrecorded: each is a
    // deliberate enum label away, not a different mechanism.
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
  // NOT requiredEnv, and the asymmetry is deliberate. The four builders above
  // run per REQUEST, so requiredEnv fails that one request loudly - which is
  // the behaviour the nine other credentials already have. This line is
  // evaluated at MODULE LOAD, so requiredEnv here would refuse to boot the API
  // on a missing variable. That may well be the right answer, but it is a
  // change to startup behaviour on a branch whose deploy sequence is delicate,
  // and it is Jacob's to make deliberately. D194.
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
    // NO canImpersonate HERE, DELIBERATELY. AdminOptions has never had one -
    // the real names are allowImpersonatingAdmins and
    // impersonationSessionDuration - so `canImpersonate: async ({ user }) =>
    // user.role === 'admin'` was read by nothing and enforced nothing.
    //
    // Nothing is lost by removing it, and this is the part worth being sure
    // about rather than assuming: the impersonate route already carries
    // `use: [adminMiddleware]` and then a hasPermission check on the caller's
    // role, throwing YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS if it fails, with
    // adminRoles defaulting to ["admin"]. That is exactly what the dead option
    // was trying to say. It is left out rather than corrected because there is
    // nothing to correct it TO - the default already does it, and a line that
    // looks like a security control but is inert is worse than no line.
    admin(),
    stripePlugin({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET as string,
      createCustomerOnSignUp: true,
    }),
  ],
});
