'use client';

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

const auth = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: 'string' },
      },
    }),
  ],
});

export const {
  useSession,
  getSession,
  signUp,
  signIn,
  signOut,
  updateUser,
  changeEmail,
  forgetPassword,
  resetPassword,
  verifyEmail,
  sendVerificationEmail,
} = auth;

export const getUser = async () => {
  const { data, error } = await getSession();
  if (data) return data.user;
  throw error;
};

export const useUser = () => {
  const { data, error, isPending } = useSession();
  return {
    user: data?.user,
    error,
    isPending,
  };
};