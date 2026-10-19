'use client'

import * as React from 'react'
import { MessageSquare, Paperclip, Phone, Send } from '@dorado/icons'

import { Accordion } from '../accordion/Accordion'
import { Alert } from '../alert/Alert'
import { Button } from '../button/Button'
import { EmptyState } from '../empty-state/EmptyState'
import { fieldTrigger } from '../field/Field'
import { cn } from '../cn'
import { Divider } from '../divider/Divider'
import { Skeleton } from '../skeleton/Skeleton'
import { CallEvent, type CallKind } from './CallEvent'
import { Message, type MessageDirection, type MessageStatus } from './Message'

export type ChatView = 'messages' | 'calls'

export type ChatStatus = 'ready' | 'loading' | 'error'

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
  agent?: React.ReactNode
  time: React.ReactNode
}

export type ChatProps = {
  phone: string
  status?: ChatStatus
  onRetry?: () => void
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

const VIEW_TITLE: Record<ChatView, string> = {
  messages: 'Customer messages',
  calls: 'Customer calls',
}

const ERROR_COPY: Record<ChatView, { title: string; body: string }> = {
  messages: {
    title: "Couldn't load messages",
    body: "Something went wrong loading this customer's messages.",
  },
  calls: {
    title: "Couldn't load calls",
    body: "Something went wrong loading this customer's calls.",
  },
}

const BUBBLE_WIDTH = ['w-[220px]', 'w-40', 'w-60']

function LoadingThread({ view }: { view: ChatView }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={view === 'messages' ? 'Loading messages' : 'Loading calls'}
      className="flex w-full flex-col gap-sm px-sm py-md"
    >
      {[0, 1, 2].map((row) =>
        view === 'messages' ? (
          <Skeleton key={row} shape="block" className={cn('h-10', BUBBLE_WIDTH[row])} />
        ) : (
          <div key={row} className="flex items-center gap-xs">
            <Skeleton shape="circle" className="size-(--control-sm) shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-xs">
              <Skeleton shape="text" />
              <Skeleton shape="text" className="w-1/2" />
            </div>
          </div>
        )
      )}
    </div>
  )
}

export function Chat({
  phone,
  status = 'ready',
  onRetry,
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
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isOpen = open ?? uncontrolledOpen
  const toggle = () => {
    if (open === undefined) setUncontrolledOpen(!uncontrolledOpen)
    onToggle?.()
  }

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
  const isEmpty = status === 'ready' && (isMessages ? messages.length === 0 : calls.length === 0)

  const switcher = (
    <span className="flex items-center gap-xs">
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
  )

  return (
    <Accordion
      label={isOpen ? VIEW_TITLE[activeView] : 'Chat'}
      trailing={isOpen ? undefined : phone}
      chevron="leading"
      open={isOpen}
      onToggle={toggle}
      actions={isOpen ? switcher : undefined}
      flush
      className={className}
    >
      <div className="flex w-full flex-col">
        <Divider />

        {status === 'loading' ? (
          <LoadingThread view={activeView} />
        ) : status === 'error' ? (
          <div className="flex w-full flex-col items-start gap-sm px-sm py-md">
            <Alert intent="danger" title={ERROR_COPY[activeView].title} className="w-full">
              {ERROR_COPY[activeView].body}
            </Alert>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col justify-center px-sm">
            <EmptyState
              icon={isMessages ? <Send aria-hidden /> : <Phone aria-hidden />}
              title={isMessages ? 'No messages yet' : 'No calls yet'}
              description={
                isMessages
                  ? 'Texts you send from here go to the customer’s phone. Their replies show up in this thread.'
                  : 'Calls to this customer are placed from here and logged below.'
              }
            />
          </div>
        ) : isMessages ? (
          <div
            role="log"
            aria-live="polite"
            aria-label={VIEW_TITLE.messages}
            className="flex w-full flex-col gap-sm p-sm"
          >
            <span className="text-center text-micro text-muted-foreground">{dayLabel}</span>
            {messages.map((m) => (
              <Message key={m.id} direction={m.direction} status={m.status} time={m.time}>
                {m.body}
              </Message>
            ))}
          </div>
        ) : (
          <ul className="flex w-full flex-col px-sm">
            {calls.map((c, index) => (
              <li key={c.id}>
                <CallEvent
                  kind={c.kind}
                  detail={c.detail}
                  agent={c.agent}
                  time={c.time}
                  className={index === calls.length - 1 ? 'border-b-0' : undefined}
                />
              </li>
            ))}
          </ul>
        )}

        <Divider />

        {isMessages ? (
          <div className="flex w-full items-center gap-xs p-sm">
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
              className={cn(
                fieldTrigger(),
                'min-h-(--control-md) text-field placeholder:text-muted-foreground'
              )}
            />
            <Button size="icon" aria-label="Send" onClick={send}>
              <Send aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="w-full p-sm">
            <Button className="w-full" icon={Phone} onClick={onCall}>
              {`Call ${phone}`}
            </Button>
          </div>
        )}
      </div>
    </Accordion>
  )
}
