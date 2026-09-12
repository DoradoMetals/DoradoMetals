'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
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

import { apiRequest } from '../fetch'
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
