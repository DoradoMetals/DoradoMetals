'use client'

import * as React from 'react'
import { Chat, type ChatCall, type ChatMessage } from '@dorado/components'
import type { CallKind, CustomerTimeline, SmsMedia, SmsMessage } from '@dorado/contracts'

import { DASH, when } from './format'

export type ChatCardProps = {
  phone: string | null
  messages: SmsMessage[]
  timeline: CustomerTimeline[]
  onSend?: (body: string, media?: SmsMedia[]) => void
  onCall?: () => void
}

// The four call kinds are the API's `call_kind`, paired from direction and
// status in SQL; the card only spells them.
const KIND: Record<CallKind, ChatCall['kind']> = {
  Outgoing: 'outgoing',
  'No answer': 'no-answer',
  Incoming: 'incoming',
  Missed: 'missed',
}

export function ChatCard({ phone, messages, timeline, onSend, onCall }: ChatCardProps) {
  const [media, setMedia] = React.useState<SmsMedia[]>([])
  const input = React.useRef<HTMLInputElement>(null)

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
    .filter((row) => row.kind === 'call' && row.call_kind !== null)
    .map((row) => ({
      id: row.id,
      kind: KIND[row.call_kind!],
      detail: row.summary,
      time: when(row.at),
    }))

  return (
    <>
      <Chat
        phone={phone ?? DASH}
        messages={chatMessages}
        calls={calls}
        onSend={
          onSend
            ? (body) => {
                onSend(body, media.length > 0 ? media : undefined)
                setMedia([])
              }
            : undefined
        }
        onAttach={onSend ? () => input.current?.click() : undefined}
        onCall={onCall}
      />
      {onSend && (
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          data-testid="sms-attach"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) setMedia([{ url: URL.createObjectURL(file), content_type: file.type }])
            event.target.value = ''
          }}
        />
      )}
      {media.length > 0 && (
        <p className="text-micro text-muted-foreground">{media.length} attachment ready to send</p>
      )}
    </>
  )
}
