'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryCache } from '@dorado/client'
import { useAsyncAction } from '@/shared/hooks/useAsyncAction'

import {
  admin,
  auth,
  changeEmail,
  changePassword,
  listSessions,
  requestPasswordReset,
  resetPassword,
  revokeSession,
  sendVerificationEmail,
  signIn,
  signOut,
  signUp,
  updateUser,
  useUser,
  verifyEmail,
} from '@/shared/hooks/auth/authClient'
import {
  forgetSession,
  useSetPassword as useSetPasswordHook,
  useVerifyRecaptcha as useVerifyRecaptchaHook,
} from '@dorado/client'

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
// more (ruling 62: no useQuery/useMutation left outside @dorado/client). No
// consumer here ever reads `.refetch`.
export const useGetSession = () => {
  const { user, session, error, isPending } = useUser()
  return { user, session, error, isPending }
}

export const useUpdateUser = () =>
  useAsyncAction((userData: { name?: string; image?: string }) => updateUser(userData))

export const useChangeEmail = () =>
  useAsyncAction((newEmail: string) =>
    changeEmail({ newEmail, callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/change-email` })
  )

export const useSignUp = () =>
  useAsyncAction((userData: { email: string; password: string; name: string }) =>
    signUp.email(
      {
        email: userData.email,
        password: userData.password,
        name: userData.name,
        callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/verify-email`,
        role: 'user',
      },
      {
        onError(ctx) {
          throw ctx.error
        },
      }
    )
  )

export const useSignIn = () => {
  const router = useRouter()
  const { clear } = useQueryCache()

  return useAsyncAction(
    async (vars: { email: string; password: string; rememberMe: boolean }) => {
      try {
        return await signIn.email(vars, {
          onError(ctx) {
            throw ctx.error
          },
        })
      } finally {
        // NOTHING MERGES HERE ANY MORE. The visitor's basket is moved onto the
        // real account by the SERVER, in better-auth's onLinkAccount hook
        // (api domain/checkout/adopt.ts), before this response is written - so
        // signing in only has to forget who it used to be and drop every
        // other cached read.
        forgetSession()
        clear()
      }
    },
    { onSuccess: () => router.replace('/') }
  )
}

export const useSignOut = () => {
  const router = useRouter()
  const { removeAll } = useQueryCache()

  return useAsyncAction(
    // THE TWO PRE-LOGOUT SYNCS ARE GONE. They existed to push the browser's
    // basket to the server before the session went; the browser has no basket,
    // and the rows are already the server's. Signing out leaves them on the
    // account they belong to.
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

export const useRequestPasswordReset = () =>
  useAsyncAction((email: string) => requestPasswordReset({ email, redirectTo: '/reset-password' }))

export const useResetPassword = () =>
  useAsyncAction(({ newPassword, token }: { newPassword: string; token: string }) =>
    resetPassword({ newPassword, token })
  )

export const useChangePassword = () =>
  useAsyncAction(
    ({ newPassword, currentPassword }: { newPassword: string; currentPassword: string }) =>
      changePassword({ newPassword, currentPassword, revokeOtherSessions: true })
  )

export const useVerifyEmail = () =>
  useAsyncAction((token: string) => verifyEmail({ query: { token } }))

export const useSendVerifyEmail = () =>
  useAsyncAction((email: string) => sendVerificationEmail({ email }))

export const useCreateUser = () =>
  useAsyncAction(async ({ email, name }: { email: string; name: string }) => {
    // Create the account passwordless (omit password) so the user can set
    // their own password after signing in via the magic link on
    // /verify-login. better-auth's setPassword rejects accounts that already
    // have a password, so giving one here would block that flow.
    const newUser = await admin.createUser({ email, name, role: 'user' })
    await signIn.magicLink({
      email,
      callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/verify-login`,
    })
    return newUser
  })

// OUR TWO ENDPOINTS ARE @dorado/client'S NOW (ruling 62). They were the last
// two `apiRequest` calls under frontend/ outside the legacy transport, which
// is what kept this surface on lint:client-boundary's PENDING list. Re-exported
// under their old names because the auth UI imports them from here.
export const useSetPassword = useSetPasswordHook

// admin.* has no atomListener of its own (unlike sign-in/sign-out/
// update-user), so nothing refreshes the reactive session for an impersonated
// identity without asking - `auth.$store.notify` is better-auth's own,
// documented way to do that (the same signal signIn/signOut trigger for you).
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

// Revoking a session does not refresh `useListSessions` itself - two
// independent calls to that hook do not share state. The caller passes its
// own `refetch` in as a per-call option (`revokeSession.mutate(token, {
// onSuccess: refetch })`), same as any other write settling a read it does
// not own outright.
export const useRevokeSession = () => useAsyncAction((token: string) => revokeSession({ token }))

export const useVerifyRecaptcha = useVerifyRecaptchaHook
