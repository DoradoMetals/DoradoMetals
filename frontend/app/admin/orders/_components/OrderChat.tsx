'use client'

import {
  Chat,
  type ChatCall,
  type ChatMessage,
  type CallKind as ChatCallKind,
} from '@dorado/components'
import type { CallKind, SmsDeliveryStatus } from '@dorado/contracts'

import { formatStamp } from '@/shared/utils/formatStamp'

import { useCalls, useTextCustomer, useThread } from '../_api'
import { formatDuration } from '../_lib'

const CALL_KINDS: Record<CallKind, ChatCallKind> = {
  Outgoing: 'outgoing',
  'No answer': 'no-answer',
  Incoming: 'incoming',
  Missed: 'missed',
}

const messageStatus = (status: SmsDeliveryStatus): ChatMessage['status'] =>
  status === 'failed' || status === 'undelivered'
    ? 'failed'
    : status === 'queued' || status === 'sent'
      ? 'sending'
      : 'delivered'

export function OrderChat({ userId }: { userId: string }) {
  const thread = useThread(userId)
  const timeline = useCalls(userId)
  const text = useTextCustomer(userId)

  const sample = (thread.data ?? [])[0]
  const phone = sample
    ? sample.direction === 'inbound'
      ? sample.from_number
      : sample.to_number
    : ''

  const messages: ChatMessage[] = (thread.data ?? []).map((message) => ({
    id: message.id,
    direction: message.direction,
    status: message.direction === 'outbound' ? messageStatus(message.status) : undefined,
    time: formatStamp(message.created_at),
    body: message.body ?? '',
  }))

  const calls: ChatCall[] = (timeline.data ?? [])
    .filter((entry) => entry.kind === 'call' && entry.call_kind !== null)
    .map((entry) => ({
      id: entry.id,
      kind: CALL_KINDS[entry.call_kind as CallKind],
      detail: formatDuration(entry.duration_seconds),
      agent: entry.actor_name,
      time: formatStamp(entry.at),
    }))

  return (
    <Chat
      phone={phone}
      status={
        thread.isError || timeline.isError
          ? 'error'
          : thread.isPending || timeline.isPending
            ? 'loading'
            : 'ready'
      }
      onRetry={() => {
        thread.refetch()
        timeline.refetch()
      }}
      messages={messages}
      calls={calls}
      onSend={(body) => text.mutate({ user_id: userId, body })}
    />
  )
}
