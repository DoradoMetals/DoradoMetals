import { requiredEnv } from '#shared/env/required.ts'
import '#env'
import { betterAuth } from 'better-auth'
import { magicLink, admin, anonymous } from 'better-auth/plugins'
import { stripe as stripePlugin } from '@better-auth/stripe'
import { Pool } from 'pg'

import stripeClient from '#providers/payment/stripe-client.ts'
import { fillMissingRole, withoutAnonymousCustomers } from '#accounts/auth/anonymous.ts'
import { adoptAnonymousCheckoutQuietly } from '#checkout/adopt.ts'
import { sendEmail } from '#providers/emails/nodemailer.ts'
import { sendAuthVerificationEmail } from '#documents/emails/service.ts'
import {
  renderChangeEmail,
  renderResetPasswordEmail,
  renderCreateAccountEmail,
} from '#documents/emails/utils/renderEmail.ts'

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
        const emailUrl = `${requiredEnv('FRONTEND_URL')}/change-email?token=${token}`
        await sendEmail({
          to: user.email,
          subject: 'Approve Email Change',
          html: renderChangeEmail({ firstName: user.name, url: emailUrl }),
        })
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
  databaseHooks: {
    user: { create: { before: async (user) => fillMissingRole(user) } },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, token }) => {
      const emailUrl = `${requiredEnv('FRONTEND_URL')}/reset-password?token=${token}`
      await sendEmail({
        to: user.email,
        subject: 'Reset Your Password',
        html: renderResetPasswordEmail({ firstName: user.name, url: emailUrl }),
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }, request) => {
      await sendAuthVerificationEmail(
        user,
        `${requiredEnv('FRONTEND_URL')}/verify-email?token=${token}`,
        request?.url?.includes('/sign-up') ?? false
      )
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
        const emailUrl = `${requiredEnv('FRONTEND_URL')}/verify-login?token=${token}`
        await sendEmail({
          to: email,
          subject: 'Your Dorado account is ready',
          html: renderCreateAccountEmail({ firstName: '', url: emailUrl }),
        })
      },
    }),

    admin(),

    anonymous({
      emailDomainName: 'anonymous.dorado.invalid',

      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await adoptAnonymousCheckoutQuietly(anonymousUser.user.id, newUser.user.id)
      },

      disableDeleteAnonymousUser: true,
    }),

    withoutAnonymousCustomers(
      stripePlugin({
        stripeClient,
        stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET as string,
        createCustomerOnSignUp: true,
      })
    ),
  ],
})
