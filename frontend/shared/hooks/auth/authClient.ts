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
    anonymousClient(),
    stripeClient({
      subscription: false,
    }),
  ],
})

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
