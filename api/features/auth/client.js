import "#env";
import { betterAuth } from 'better-auth';
import { magicLink, admin } from 'better-auth/plugins';
import { stripe as stripePlugin } from '@better-auth/stripe';
import { Pool } from 'pg';

import stripeClient from '#providers/payment/stripe-client.ts';
import { sendEmail } from '#providers/emails/nodemailer.ts';
import {
  renderAccountCreatedEmail,
  renderVerifyEmail,
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
        const emailUrl = `${process.env.FRONTEND_URL}/change-email?token=${token}`;
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
      const emailUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
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
      const isSignUp = request?.url?.includes('/sign-up');
      const emailUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: isSignUp ? 'Welcome to Dorado Metals Exchange' : 'Verify Your Email Address',
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
      sendMagicLink: async ({ email, token }) => {
        const emailUrl = `${process.env.FRONTEND_URL}/verify-login?token=${token}`;
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
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      createCustomerOnSignUp: true,
    }),
  ],
});
