'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CustomerTimeline, SmsMessage, SmsSendBody } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

// Messages, calls and mailers merged by one SQL read. The Chat card's Calls
// view is this, filtered on kind.
export function useCustomerTimeline(userId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery<CustomerTimeline[]>({
    queryKey: keys.crm.timeline(userId ?? ''),
    enabled: (options.enabled ?? true) && !!userId,
    queryFn: () => apiRequest<CustomerTimeline[]>('GET', `/customers/${userId}/timeline`),
  })
}

// The message bodies. The timeline carries a summary; the Messages view needs
// what was actually said.
export function useConversation(userId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery<SmsMessage[]>({
    queryKey: keys.crm.conversation(userId ?? ''),
    enabled: (options.enabled ?? true) && !!userId,
    queryFn: () => apiRequest<SmsMessage[]>('GET', '/sms', undefined, { user_id: userId }),
  })
}

// The composer. The number it goes to is the customer's own, read server-side;
// `media` carries an MMS. A send moves both the conversation and the timeline.
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
