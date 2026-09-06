'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryCache } from '@dorado/client'
import { useAsyncAction } from '@/shared/hooks/useAsyncAction'

import {
  admin,
  auth,
  listSessions,
  revokeSession,
  signIn,
  signOut,
  updateUser,
  useUser,
} from '@/shared/hooks/auth/authClient'
import { forgetSession, useVerifyRecaptcha as useVerifyRecaptchaHook } from '@dorado/client'

// WHAT IS LEFT TO CLEAR IS UI STATE (ruling 63: "Frontend stores should be for
// UI elements, not data"). The basket is not here any more - it is server rows
// under the session's own user id, and changing identity changes which rows the
// queries answer with. `forgetSession` is the one thing this must do: it makes
// @dorado/client ask again who is signed in before the next basket write,
// rather than writing against a session that has gone.
const clearClientState = () => {
  forgetSession()
  localStorage.removeItem('dorado_checkout_items')
  localStorage.removeItem('purchase-order-checkout')
  localStorage.removeItem('sales-order-checkout')
}

// better-auth's own `useSession()` (via `useUser`) is REACTIVE - a nanostore
// atom, not a react-query cache - so this is a name, not a network call any
// more (ruling 62: no useQuery/useMutation left outside @dorado/client).
export const useGetSession = () => {
  const { user, session, error, isPending } = useUser()
  return { user, session, error, isPending }
}

export const useUpdateUser = () =>
  useAsyncAction((userData: { name?: string; image?: string }) => updateUser(userData))

// EVERY SIGN-IN ENDS IN A CODE (ruling 91), so what used to be `useSignIn` is
// the verify step in `@dorado/client`. What is left here is the housekeeping a
// new identity forces: forget who the client thought was signed in, and drop
// every cached read taken as somebody else.
export const useAdoptSession = () => {
  const { clear } = useQueryCache()
  return useCallback(() => {
    forgetSession()
    clear()
  }, [clear])
}

export const useSignOut = () => {
  const router = useRouter()
  const { removeAll } = useQueryCache()

  return useAsyncAction(
    async () => {
      await signOut()
    },
    {
      onSuccess: () => {
        clearClientState()
        removeAll()
        router.replace('/')
      },
    }
  )
}

export const useGoogleSignIn = () => {
  const router = useRouter()
  const { clear } = useQueryCache()

  return useAsyncAction(
    async () => {
      try {
        return await signIn.social({
          provider: 'google',
          callbackURL: process.env.NEXT_PUBLIC_FRONTEND_URL,
        })
      } finally {
        forgetSession()
        clear()
      }
    },
    { onSuccess: () => router.replace('/') }
  )
}

// The account is created and the customer signs in with a code like anybody
// else - there is no invitation link to send any more.
export const useCreateUser = () =>
  useAsyncAction(({ email, name }: { email: string; name: string }) =>
    admin.createUser({ email, name, role: 'user' })
  )

// admin.* has no atomListener of its own (unlike sign-in/sign-out/
// update-user), so nothing refreshes the reactive session for an impersonated
// identity without asking - `auth.$store.notify` is better-auth's own,
// documented way to do that.
export const useImpersonateUser = () => {
  const router = useRouter()
  const { removeAll } = useQueryCache()

  return useAsyncAction(
    async ({ user_id }: { user_id: string }) => {
      clearClientState()
      removeAll()
      return admin.impersonateUser({ userId: user_id })
    },
    {
      onSuccess: () => {
        auth.$store.notify('$sessionSignal')
        router.replace('/')
      },
    }
  )
}

export const useStopImpersonation = () => {
  const router = useRouter()
  const { removeAll } = useQueryCache()

  return useAsyncAction(
    async () => {
      clearClientState()
      removeAll()
      await admin.stopImpersonating()
    },
    {
      onSuccess: () => {
        auth.$store.notify('$sessionSignal')
        router.replace('/admin')
      },
    }
  )
}

// better-auth's dynamic client proxy types `listSessions()` too loosely for
// TS to carry the row shape through - named here instead, for the fields
// ActiveDevices.tsx actually reads.
type ListedSession = {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  expiresAt: string | Date
}

export const useListSessions = () => {
  const [data, setData] = useState<ListedSession[]>([])
  const [isPending, setIsPending] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setIsPending(true)
    try {
      const { data, error } = await listSessions()
      if (error) throw new Error(error.message)
      setData((data ?? []) as ListedSession[])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsPending(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, error, isPending, refetch }
}

export const useRevokeSession = () => useAsyncAction((token: string) => revokeSession({ token }))

export const useVerifyRecaptcha = useVerifyRecaptchaHook
