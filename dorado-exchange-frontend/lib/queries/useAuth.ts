import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '@/lib/authClient'
import { useRouter } from 'next/navigation'
import { useUserStore } from '@/store/useUserStore'

export const useSession = () => {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await authClient.getSession()
      if (error) throw new Error(error.message)
      return data
    },
    staleTime: 1000 * 60 * 5,
  })
}

export const useUpdateUser = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userData: { name?: string; image?: string }) =>
      authClient.updateUser(userData),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] }) // Refresh session
    },
  })
}

export const useChangeEmail = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newEmail: string) =>
      authClient.changeEmail({
        newEmail,
        callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/change-email`,
      }),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export const useSignUp = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userData: { email: string; password: string; name?: string }) =>
      authClient.signUp.email({
        email: userData.email,
        password: userData.password,
        name: userData.name || '',
        callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/verify-email`,
      }),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] }) // Refresh session
    },
  })
}

export const useSignIn = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      email,
      password,
      rememberMe,
    }: {
      email: string
      password: string
      rememberMe: boolean
    }) => authClient.signIn.email({ email, password, rememberMe }),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export const useSignOut = () => {
  const clearSession = useUserStore((state) => state.clearSession);
  const fetchSession = useUserStore((state) => state.fetchSession);
  const router = useRouter();

  return useMutation({
    mutationFn: () => authClient.signOut(),
    onMutate: () => {
      clearSession();
    },
    onSuccess: async () => {
      await fetchSession();
      router.replace('/');
    },
  });
};


export const useGoogleSignIn = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      authClient.signIn.social({
        provider: 'google',
        callbackURL: process.env.NEXT_PUBLIC_FRONTEND_URL,
      }),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export const useForgotPassword = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => authClient.forgetPassword({ email }),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export const useResetPassword = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ newPassword, token }: { newPassword: string; token: string }) =>
      authClient.resetPassword({ newPassword, token }),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export const useVerifyEmail = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => authClient.verifyEmail({ query: { token } }),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export const useSendVerifyEmail = () => {
  const fetchSession = useUserStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => authClient.sendVerificationEmail({ email }),
    onSettled: () => {
      fetchSession()
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}
