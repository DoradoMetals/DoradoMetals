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
import { forgetSession } from '@dorado/client'

const clearClientState = () => {
  forgetSession()
  localStorage.removeItem('dorado_checkout_items')
  localStorage.removeItem('purchase-order-checkout')
  localStorage.removeItem('sales-order-checkout')
}

export const useGetSession = () => {
  const { user, session, error, isPending } = useUser()
  return { user, session, error, isPending }
}

export const useUpdateUser = () =>
  useAsyncAction((userData: { name?: string; image?: string }) => updateUser(userData))

export const useAdoptSession = () => {
  const { clear } = useQueryCache()
  return useCallback(() => {
    forgetSession()
    clear()
    auth.$store.notify('$sessionSignal')
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

export const useCreateUser = () =>
  useAsyncAction(({ email, name }: { email: string; name: string }) =>
    admin.createUser({ email, name, role: 'user' })
  )

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
