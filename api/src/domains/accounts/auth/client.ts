import '#env'
import { betterAuth } from 'better-auth'
import { admin, anonymous, emailOTP, phoneNumber } from 'better-auth/plugins'
import { stripe as stripePlugin } from '@better-auth/stripe'
import { Pool } from 'pg'

import stripeClient from '#providers/payment/stripe-client.ts'
import * as sms from '#providers/sms/index.ts'
import { fillMissingRole, withoutAnonymousCustomers } from '#accounts/auth/anonymous.ts'
import * as rules from '#accounts/auth/rules.ts'
import { adoptAnonymousCheckoutQuietly } from '#checkout/adopt.ts'
import { sendSignInCode } from '#documents/emails/service.ts'

// Every route ends in a code (ruling 91). There is no credential provider, no
// reset flow and no magic link: better-auth mints every code, SMS or email
// alike, and Twilio only delivers it.
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
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  trustedOrigins: [process.env.FRONTEND_URL as string],
  plugins: [
    phoneNumber({
      otpLength: rules.OTP_LENGTH,
      expiresIn: rules.OTP_EXPIRES_SECONDS,
      allowedAttempts: rules.PLUGIN_ALLOWED_ATTEMPTS,
      phoneNumberValidator: (value: string) => rules.isUsPhone(value),
      sendOTP: async ({ phoneNumber: to, code }) => {
        await sms.send(
          to,
          `${code} is your Dorado Metals code. It expires in ` +
            `${rules.OTP_EXPIRES_SECONDS / 60} minutes.`
        )
      },
      signUpOnVerification: {
        getTempEmail: (value: string) => rules.temporaryEmailFor(value),
      },
      schema: {
        user: {
          fields: {
            phoneNumber: 'phone_number',
            phoneNumberVerified: 'phone_number_verified',
          },
        },
      },
    }),

    emailOTP({
      otpLength: rules.OTP_LENGTH,
      expiresIn: rules.OTP_EXPIRES_SECONDS,
      allowedAttempts: rules.PLUGIN_ALLOWED_ATTEMPTS,
      // Without this an unknown address gets an account minted with no phone,
      // and the send itself would say whether the address is known.
      disableSignUp: true,
      sendVerificationOTP: async ({ email, otp }) => {
        await sendSignInCode({
          order_id: null,
          user_id: null,
          email,
          name: null,
          code: otp,
          expires_in_minutes: rules.OTP_EXPIRES_SECONDS / 60,
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
