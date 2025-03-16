import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/authClient";
import { useRouter } from "next/navigation";

export const useSession = () => {
  return useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data, error } = await authClient.getSession();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: { name?: string; image?: string }) =>
      authClient.updateUser(userData),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] }); // Refresh session
    },
  });
};

export const useChangeEmail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newEmail: string) =>
      authClient.changeEmail({
        newEmail,
        callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/change-email`,
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
};

export const useSignUp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: { email: string; password: string; name?: string }) =>
      authClient.signUp.email({
        email: userData.email,
        password: userData.password,
        name: userData.name || "",
        callbackURL: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/verify-email`,
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] }); // Refresh session
    },
  });
};

export const useSignIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password, rememberMe }: { email: string; password: string; rememberMe: boolean }) =>
      authClient.signIn.email({ email, password, rememberMe }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
};

export const useSignOut = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => {
      queryClient.removeQueries();
      queryClient.cancelQueries();
      queryClient.clear();
      router.push("/");
      console.log('sign out: ', queryClient)
    },
  });
};

export const useGoogleSignIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      authClient.signIn.social({
        provider: "google",
        callbackURL: process.env.NEXT_PUBLIC_FRONTEND_URL,
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
};

export const useForgotPassword = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (email: string) =>
      authClient.forgetPassword({ email }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
};

export const useResetPassword = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ newPassword, token }: { newPassword: string; token: string }) =>
      authClient.resetPassword({ newPassword, token }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
};

export const useVerifyEmail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => 
      authClient.verifyEmail({ query: { token } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
};

export const useSendVerifyEmail = () => {
  return useMutation({
    mutationFn: async (email: string) => 
      authClient.sendVerificationEmail({email}),
  });
}
