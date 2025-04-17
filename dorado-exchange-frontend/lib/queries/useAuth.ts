'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { cartStore } from '@/store/cartStore';
import { sellCartStore } from '@/store/sellCartStore';
import { useSyncCartToBackend } from './useCart';
import { useSyncSellCartToBackend } from './useSellCart';
import { apiRequest } from '@/utils/axiosInstance';
import { Product } from '@/types/product';
import { SellCartItem } from '@/types/sellCart';
import {
  changeEmail,
  forgetPassword,
  getSession,
  resetPassword,
  sendVerificationEmail,
  signIn,
  signOut,
  signUp,
  updateUser,
  verifyEmail,
} from '../authClient';

export const useGetSession = () => {
  const {
    data: session,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await getSession();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return {
    user: session?.user,
    session,
    error,
    isPending,
    refetch,
  };
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: { name?: string; image?: string }) =>
      updateUser(userData),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useChangeEmail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newEmail: string) =>
      changeEmail({
        newEmail,
        callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/change-email`,
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useSignUp = () => {
  const queryClient = useQueryClient();
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
            throw ctx.error;
          },
        }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useSignIn = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const mergeCartItems = cartStore((state) => state.mergeCartItems);
  const mergeSellCart = sellCartStore((state) => state.mergeSellCart);

  return useMutation({
    mutationFn: async ({
      email,
      password,
      rememberMe,
    }: {
      email: string;
      password: string;
      rememberMe: boolean;
    }) =>
      signIn.email(
        { email, password, rememberMe },
        {
          onError(ctx) {
            throw ctx.error;
          },
        }
      ),
    onSettled: async () => {
      const session = (await getSession()).data;
      if (session?.user?.id) {
        try {
          const backendCart = await apiRequest<Product[]>('GET', '/cart/get_cart', undefined, {
            user_id: session.user.id,
          });
          mergeCartItems(backendCart);
        } catch (err) {
          console.error('Cart hydration failed:', err);
        }

        try {
          const backendCart = await apiRequest<SellCartItem[]>(
            'GET',
            '/sell_cart/get_sell_cart',
            undefined,
            {
              user_id: session.user.id,
            }
          );
          mergeSellCart(backendCart);
        } catch (err) {
          console.error('Sell cart hydration failed:', err);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onSuccess: async () => {
      router.replace('/');
    }
  });
};

export const useSignOut = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const syncCart = useSyncCartToBackend();
  const syncSellCart = useSyncSellCartToBackend();

  return useMutation({
    mutationFn: async () => {

      try {
        await syncCart.mutateAsync();
      } catch (err) {
        console.warn('Cart sync failed, continuing logout:', err);
      }

      try {
        await syncSellCart.mutateAsync();
      } catch (err) {
        console.warn('Sell cart sync failed, continuing logout:', err);
      }

      await signOut();
    },
    onSuccess: async () => {
      cartStore.getState().clearCart();
      sellCartStore.getState().clearCart();
      localStorage.removeItem('dorado_cart');
      localStorage.removeItem('dorado_sell_cart');
      localStorage.removeItem('cartSynced');
      localStorage.removeItem('purchase-order-checkout')
      queryClient.removeQueries()
      router.replace('/');

    },
  });
};

export const useGoogleSignIn = () => {
  const queryClient = useQueryClient();
  const mergeCartItems = cartStore((state) => state.mergeCartItems);
  const mergeSellCart = sellCartStore((state) => state.mergeSellCart);

  return useMutation({
    mutationFn: async () =>
      signIn.social({
        provider: 'google',
        callbackURL: process.env.NEXT_PUBLIC_FRONTEND_URL,
      }),
    onSettled: async () => {
      const session = (await getSession()).data;
      if (session?.user?.id) {
        try {
          const backendCart = await apiRequest<Product[]>('GET', '/cart/get_cart', undefined, {
            user_id: session.user.id,
          });
          mergeCartItems(backendCart);
        } catch (err) {
          console.error('Cart hydration failed:', err);
        }

        try {
          const backendCart = await apiRequest<SellCartItem[]>(
            'GET',
            '/sell_cart/get_sell_cart',
            undefined,
            {
              user_id: session.user.id,
            }
          );
          mergeSellCart(backendCart);
        } catch (err) {
          console.error('Sell cart hydration failed:', err);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useForgotPassword = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => forgetPassword({ email }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useResetPassword = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ newPassword, token }: { newPassword: string; token: string }) =>
      resetPassword({ newPassword, token }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useVerifyEmail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => verifyEmail({ query: { token } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useSendVerifyEmail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => sendVerificationEmail({ email }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};
