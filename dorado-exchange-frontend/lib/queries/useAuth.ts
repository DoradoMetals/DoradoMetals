'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { cartStore } from '@/store/cartStore'
import { sellCartStore } from '@/store/sellCartStore'
import { useSyncCartToBackend } from './useCart'
import { useSyncSellCartToBackend } from './useSellCart'
import { apiRequest } from '@/utils/axiosInstance'
import { Product } from '@/types/product'
import { SellCartItem } from '@/types/sellCart'
import {
  admin,
  changeEmail,
  changePassword,
  getSession,
  listSessions,
  requestPasswordReset,
  resetPassword,
  revokeOtherSessions,
  revokeSession,
  revokeSessions,
  sendVerificationEmail,
  signIn,
  signOut,
  signUp,
  updateUser,
  verifyEmail,
} from '../authClient'

const clearClientState = () => {
  cartStore.getState().clearCart()
  sellCartStore.getState().clearCart()
  localStorage.removeItem('dorado_cart')
  localStorage.removeItem('dorado_sell_cart')
  localStorage.removeItem('cartSynced')
  localStorage.removeItem('purchase-order-checkout')
  localStorage.removeItem('sales-order-checkout')
}

const hydrateCarts = async (userId: string) => {
  try {
    const backendCart = await apiRequest<Product[]>('GET', '/cart/get_cart', undefined, {
      user_id: userId,
    })
    cartStore.getState().mergeCartItems(backendCart)
  } catch (err) {
    console.error('Cart hydration failed:', err)
  }

  try {
    const backendSellCart = await apiRequest<SellCartItem[]>(
      'GET',
      '/sell_cart/get_sell_cart',
      undefined,
      { user_id: userId }
    )
    sellCartStore.getState().mergeSellCart(backendSellCart)
  } catch (err) {
    console.error('Sell cart hydration failed:', err)
  }
}

export const useGetSession = () => {
  const {
    data: session,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await getSession()
      if (error) throw new Error(error.message)
      return data
    },
    refetchInterval: 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  return {
    user: session?.user,
    session: session?.session,
    error,
    isPending,
    refetch,
  }
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userData: { name?: string; image?: string }) => updateUser(userData),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
  })
}

export const useChangeEmail = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newEmail: string) =>
      changeEmail({
        newEmail,
        callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/change-email`,
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
  })
}

export const useSignUp = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userData: { email: string; password: string; name: string }) =>
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
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
  })
}

export const useSignIn = () => {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({
      email,
      password,
      rememberMe,
    }: {
      email: string
      password: string
      rememberMe: boolean
    }) =>
      signIn.email(
        { email, password, rememberMe },
        {
          onError(ctx) {
            throw ctx.error
          },
        }
      ),
    onSettled: async () => {
      queryClient.clear()
      const session = (await getSession()).data
      if (session?.user?.id) {
        await hydrateCarts(session.user.id)
      }
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
    onSuccess: async () => {
      router.replace('/')
    },
  })
}

export const useSignOut = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const syncCart = useSyncCartToBackend()
  const syncSellCart = useSyncSellCartToBackend()

  return useMutation({
    mutationFn: async () => {
      try {
        await syncCart.mutateAsync()
      } catch (err) {
        console.warn('Cart sync failed, continuing logout:', err)
      }

      try {
        await syncSellCart.mutateAsync()
      } catch (err) {
        console.warn('Sell cart sync failed, continuing logout:', err)
      }

      await signOut()
    },
    onSuccess: async () => {
      clearClientState()
      queryClient.removeQueries()
      router.replace('/')
    },
  })
}

export const useGoogleSignIn = () => {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async () =>
      signIn.social({
        provider: 'google',
        callbackURL: process.env.NEXT_PUBLIC_FRONTEND_URL,
      }),
    onSettled: async () => {
      queryClient.clear()
      const session = (await getSession()).data
      if (session?.user?.id) {
        await hydrateCarts(session.user.id)
      }
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
    onSuccess: async () => {
      router.replace('/')
    },
  })
}

export const useRequestPasswordReset = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) =>
      requestPasswordReset({ email, redirectTo: '/reset-password' }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
  })
}

export const useResetPassword = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ newPassword, token }: { newPassword: string; token: string }) =>
      resetPassword({ newPassword, token }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
  })
}

export const useChangePassword = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      newPassword,
      currentPassword,
    }: {
      newPassword: string
      currentPassword: string
    }) =>
      changePassword({
        newPassword: newPassword,
        currentPassword: currentPassword,
        revokeOtherSessions: true,
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
  })
}

export const useVerifyEmail = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => verifyEmail({ query: { token } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
  })
}

export const useSendVerifyEmail = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => sendVerificationEmail({ email }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
    },
  })
}

export const useCreateUser = () => {
  return useMutation({
    mutationFn: async ({ email, name }: { email: string; name: string }) => {
      const newUser = await admin.createUser({
        email: email,
        password: crypto.randomUUID(),
        name: name,
        role: 'user',
      })

      await signIn.magicLink({
        email,
        callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/verify-login`,
      })

      return newUser
    },
  })
}

export const useImpersonateUser = () => {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({ user_id }: { user_id: string }) => {
      clearClientState()
      queryClient.removeQueries()
      const user_impersonating = await admin.impersonateUser({
        userId: user_id,
      })
      return user_impersonating
    },
    onSettled: async () => {
      const session = (await getSession()).data
      if (session?.user?.id) {
        await hydrateCarts(session.user.id)
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
      router.replace('/')
    },
  })
}

export const useStopImpersonation = () => {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async () => {
      clearClientState()
      queryClient.removeQueries()
      await admin.stopImpersonating()
    },
    onSettled: async () => {
      const session = (await getSession()).data
      if (session?.user?.id) {
        await hydrateCarts(session.user.id)
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'active' })
      router.replace('/admin')
    },
  })
}

export const useListSessions = () => {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data, error } = await listSessions()
      if (error) throw new Error(error.message)
      return data
    },
    refetchInterval: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  return {
    data,
    error,
    isPending,
    refetch,
  }
}

export const useRevokeSession = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => revokeSession({ token }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'], refetchType: 'active' })
    },
  })
}

export const useRevokeOtherSession = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => revokeOtherSessions(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'], refetchType: 'active' })
    },
  })
}

export const useRevokeAllSessions = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => revokeSessions(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'], refetchType: 'active' })
    },
  })
}
