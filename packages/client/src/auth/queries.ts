'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AuthFakesView,
  ChangeConfirmedView,
  ChangeEmailBody,
  ChangePhoneBody,
  ConfirmChangeBody,
  SendCodeBody,
  SessionView,
  SignUpBody,
  VerificationView,
  VerifyCodeBody,
} from '@dorado/contracts'

import { apiRequest, ApiError } from '../fetch'
import { keys } from '../keys'

export function useSession(options: { enabled?: boolean } = {}) {
  return useQuery<SessionView>({
    queryKey: keys.auth.session(),
    enabled: options.enabled ?? true,
    staleTime: 0,
    queryFn: () => apiRequest<SessionView>('GET', '/account/session'),
  })
}

export function useSendCode() {
  return useMutation({
    mutationFn: (body: SendCodeBody) =>
      apiRequest<VerificationView>('POST', '/account/send_code', body),
  })
}

export function useVerifyCode() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: VerifyCodeBody) =>
      apiRequest<VerificationView>('POST', '/account/verify_code', body),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.auth.all(), refetchType: 'active' })
    },
  })
}

export function useSignUp() {
  return useMutation({
    mutationFn: (body: SignUpBody) =>
      apiRequest<VerificationView>('POST', '/account/sign_up', body),
  })
}

export function useStepUp() {
  return useMutation({
    mutationFn: () => apiRequest<VerificationView>('POST', '/account/step_up', {}),
  })
}

export function useChangeEmail() {
  return useMutation({
    mutationFn: (body: ChangeEmailBody) =>
      apiRequest<VerificationView>('POST', '/account/change_email', body),
  })
}

export function useChangePhone() {
  return useMutation({
    mutationFn: (body: ChangePhoneBody) =>
      apiRequest<VerificationView>('POST', '/account/change_phone', body),
  })
}

export function useAuthFakes() {
  return useQuery<AuthFakesView>({
    queryKey: keys.auth.fakes(),
    staleTime: Infinity,
    queryFn: async () => {
      try {
        return await apiRequest<AuthFakesView>('GET', '/account/auth_fakes')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return { sms: false, email: false }
        throw err
      }
    },
  })
}

export function useLastCode() {
  return useMutation({
    mutationFn: (query: { number?: string; email?: string } = {}) =>
      apiRequest<{ code: string | null }>('GET', '/account/last_code', undefined, query),
  })
}

export function useConfirmChange() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: ConfirmChangeBody) =>
      apiRequest<ChangeConfirmedView>('POST', '/account/confirm_change', body),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.auth.all(), refetchType: 'active' })
    },
  })
}
