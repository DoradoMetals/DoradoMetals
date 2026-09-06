'use client'

import * as React from 'react'
import { MessageSquare, Paperclip, Phone, Send } from '@dorado/icons'

import { Accordion } from '../accordion/Accordion'
import { Button } from '../button/Button'
import { EmptyState } from '../empty-state/EmptyState'
import { fieldTrigger } from '../field/Field'
import { cn } from '../cn'
import { CallEvent, type CallKind } from './CallEvent'
import { Message, type MessageDirection, type MessageStatus } from './Message'

export type ChatView = 'messages' | 'calls'

export type ChatMessage = {
  id: string
  direction: MessageDirection
  status?: MessageStatus
  time: React.ReactNode
  body: React.ReactNode
}

export type ChatCall = {
  id: string
  kind: CallKind
  detail?: React.ReactNode
  time: React.ReactNode
}

export type ChatProps = {
  phone: string
  view?: ChatView
  defaultView?: ChatView
  onViewChange?: (view: ChatView) => void
  messages?: ChatMessage[]
  calls?: ChatCall[]
  dayLabel?: React.ReactNode
  placeholder?: string
  draft?: string
  onDraftChange?: (value: string) => void
  onSend?: (value: string) => void
  onAttach?: () => void
  onCall?: () => void
  open?: boolean
  onToggle?: () => void
  defaultOpen?: boolean
  className?: string
}

const VIEW_TITLE: Record<ChatView, string> = { messages: 'Messages', calls: 'Calls' }

export function Chat({
  phone,
  view,
  defaultView = 'messages',
  onViewChange,
  messages = [],
  calls = [],
  dayLabel = 'Today',
  placeholder = 'Text the customer…',
  draft,
  onDraftChange,
  onSend,
  onAttach,
  onCall,
  open,
  onToggle,
  defaultOpen = true,
  className,
}: ChatProps) {
  const [uncontrolledView, setUncontrolledView] = React.useState<ChatView>(defaultView)
  const activeView = view ?? uncontrolledView
  const selectView = (next: ChatView) => {
    if (view === undefined) setUncontrolledView(next)
    onViewChange?.(next)
  }

  const [uncontrolledDraft, setUncontrolledDraft] = React.useState('')
  const value = draft ?? uncontrolledDraft
  const setValue = (next: string) => {
    if (draft === undefined) setUncontrolledDraft(next)
    onDraftChange?.(next)
  }

  const send = () => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    onSend?.(trimmed)
    if (draft === undefined) setUncontrolledDraft('')
  }

  const isMessages = activeView === 'messages'
  const isEmpty = isMessages ? messages.length === 0 : calls.length === 0

  return (
    <Accordion
      label={VIEW_TITLE[activeView]}
      trailing={phone}
      chevron="leading"
      open={open}
      onToggle={onToggle}
      defaultOpen={defaultOpen}
      className={className}
    >
      <div className="-mx-1 flex w-full flex-col">
        <div className="flex justify-end pb-xs">
          <span className="flex items-center gap-3xs">
            <Button
              variant={isMessages ? 'secondary' : 'tertiary'}
              size="iconSm"
              aria-label="Messages"
              aria-pressed={isMessages}
              onClick={() => selectView('messages')}
            >
              <MessageSquare aria-hidden />
            </Button>
            <Button
              variant={isMessages ? 'tertiary' : 'secondary'}
              size="iconSm"
              aria-label="Calls"
              aria-pressed={!isMessages}
              onClick={() => selectView('calls')}
            >
              <Phone aria-hidden />
            </Button>
          </span>
        </div>

        <div className="border-t border-border" />

        {isEmpty ? (
          <div className="py-lg">
            <EmptyState
              icon={isMessages ? <Send aria-hidden /> : <Phone aria-hidden />}
              title={isMessages ? 'No messages yet' : 'No calls yet'}
              description={
                isMessages
                  ? "Texts you send from here go to the customer's phone. Their replies land in this thread."
                  : 'Calls to this customer are placed from here and logged below.'
              }
            />
          </div>
        ) : isMessages ? (
          <div className="flex w-full flex-col gap-sm py-sm">
            <span className="text-center text-micro text-muted-foreground">{dayLabel}</span>
            {messages.map((m) => (
              <Message key={m.id} direction={m.direction} status={m.status} time={m.time}>
                {m.body}
              </Message>
            ))}
          </div>
        ) : (
          <ul className="flex w-full flex-col divide-y divide-border">
            {calls.map((c) => (
              <li key={c.id}>
                <CallEvent kind={c.kind} detail={c.detail} time={c.time} />
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border" />

        {isMessages ? (
          <div className="flex w-full items-center gap-xs pt-sm">
            <Button variant="tertiary" size="icon" aria-label="Attach" onClick={onAttach}>
              <Paperclip aria-hidden />
            </Button>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              aria-label={`Text ${phone}`}
              placeholder={placeholder}
              className={cn(fieldTrigger(), 'h-10 font-normal placeholder:text-muted-foreground')}
            />
            <Button size="icon" aria-label="Send" onClick={send}>
              <Send aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="w-full pt-sm">
            <Button className="w-full" icon={Phone} onClick={onCall}>
              {`Call ${phone}`}
            </Button>
          </div>
        )}
      </div>
    </Accordion>
  )
}
