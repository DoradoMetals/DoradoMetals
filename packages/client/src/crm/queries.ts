'use client'

import { useQuery } from '@tanstack/react-query'
import type { CustomerTimeline, SmsMessage } from '@dorado/contracts'

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
