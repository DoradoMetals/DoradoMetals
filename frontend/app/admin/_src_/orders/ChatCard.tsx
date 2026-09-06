'use client'

import { Chat, type ChatCall, type ChatMessage } from '@dorado/components'
import type { CustomerTimeline, SmsMessage } from '@dorado/contracts'

import { DASH, when } from './format'

export type ChatCardProps = {
  phone: string | null
  messages: SmsMessage[]
  timeline: CustomerTimeline[]
  onSend?: (body: string) => void
  onAttach?: () => void
  onCall?: () => void
}

// Ours right, theirs left. The Calls view is the same customer timeline
// filtered on kind; the four call kinds come off the row's own direction and
// status, which is the vocabulary the timeline read hands over.
function callKind(row: CustomerTimeline): ChatCall['kind'] {
  const answered = !/no-?answer|missed|voicemail|busy|failed|canceled/i.test(row.status)
  if (row.direction === 'outbound') return answered ? 'outgoing' : 'no-answer'
  return answered ? 'incoming' : 'missed'
}

export function ChatCard({ phone, messages, timeline, onSend, onAttach, onCall }: ChatCardProps) {
  const chatMessages: ChatMessage[] = messages.map((message) => ({
    id: message.id,
    direction: message.direction,
    status:
      message.status === 'delivered'
        ? 'delivered'
        : message.status === 'failed' || message.status === 'undelivered'
          ? 'failed'
          : 'sending',
    time: when(message.sent_at ?? message.received_at ?? message.created_at),
    body: message.body ?? DASH,
  }))

  const calls: ChatCall[] = timeline
    .filter((row) => row.kind === 'call')
    .map((row) => ({
      id: row.id,
      kind: callKind(row),
      detail: row.summary,
      time: when(row.at),
    }))

  return (
    <Chat
      phone={phone ?? DASH}
      messages={chatMessages}
      calls={calls}
      onSend={onSend}
      onAttach={onAttach}
      onCall={onCall}
    />
  )
}
