'use client'

import { useQuery } from '@tanstack/react-query'
import type { OutboxMessage } from '@dorado/contracts'

import { apiRequest, baseUrl } from '../fetch'
import { keys } from '../keys'

export function useOutbox(options: { enabled?: boolean } = {}) {
  return useQuery<OutboxMessage[]>({
    queryKey: keys.documents.outbox(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<OutboxMessage[]>('GET', '/documents/outbox'),
  })
}

export function outboxMessageUrl(message_id: string): string {
  return `${baseUrl()}/documents/outbox/${encodeURIComponent(message_id)}`
}
