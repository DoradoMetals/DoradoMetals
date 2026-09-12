'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CustomerTimeline, SmsMessage, SmsSendBody } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useCustomerTimeline(userId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery<CustomerTimeline[]>({
    queryKey: keys.crm.timeline(userId ?? ''),
    enabled: (options.enabled ?? true) && !!userId,
    queryFn: () => apiRequest<CustomerTimeline[]>('GET', `/customers/${userId}/timeline`),
  })
}

export function useConversation(userId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery<SmsMessage[]>({
    queryKey: keys.crm.conversation(userId ?? ''),
    enabled: (options.enabled ?? true) && !!userId,
    queryFn: () => apiRequest<SmsMessage[]>('GET', '/sms', undefined, { user_id: userId }),
  })
}

export function useSendSms(userId: string | null) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: SmsSendBody) => apiRequest<SmsMessage>('POST', '/sms', body),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.crm.conversation(userId ?? '') })
      client.invalidateQueries({ queryKey: keys.crm.timeline(userId ?? '') })
    },
  })
}
