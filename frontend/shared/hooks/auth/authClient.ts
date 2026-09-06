'use client'

import { createAuthClient } from 'better-auth/react'
import { anonymousClient, inferAdditionalFields, adminClient } from 'better-auth/client/plugins'
import { stripeClient } from '@better-auth/stripe/client'
import { configureSession } from '@dorado/client'

export const auth = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: 'string' },
        stripeCustomerId: { type: 'string', required: false },
        dorado_funds: { type: 'number', required: false },
        phone_number: { type: 'string', required: false },
        phone_number_verified: { type: 'boolean', required: false },
      },
      session: {
        impersonatedBy: { type: 'string' },
      },
    }),
    adminClient(),
    // A VISITOR IS A USER (ruling 63). `signIn.anonymous()` is what the client
    // package's `ensureSession` reaches for below, and the server links the
    // anonymous account to the real one on sign-in or sign-up - so no flow
    // here has to merge anything.
    anonymousClient(),
    stripeClient({
      subscription: false,
    }),
  ],
})

// THE CODE IS THE ONLY KEY (ruling 91). Password, magic-link and
// email-verification methods are gone from the server config, so they are gone
// from here: sign-in, sign-up and every recovery run through `/api/account`'s
// own endpoints in `@dorado/client`. What better-auth still owns here is the
// session, the social provider and the admin plugin.
export const {
  useSession,
  getSession,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  revokeSessions,
  signIn,
  signOut,
  updateUser,
  admin,
} = auth

// THE ONE THING @dorado/client CANNOT KNOW: who is signed in, and how to make
// somebody be. The package awaits this before every checkout write; it is a
// no-op until it is registered, so this line is what turns a signed-out
// visitor's first basket touch into an anonymous account rather than a 401.
configureSession(async () => {
  const { data } = await auth.getSession()
  if (!data) await auth.signIn.anonymous()
})

export const useUser = () => {
  const { data, error, isPending } = useSession()
  return {
    user: data?.user,
    session: data?.session,
    error,
    isPending,
  }
}
