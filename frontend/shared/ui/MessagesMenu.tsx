'use client'

import { useState } from 'react'
import {
  Badge,
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Text,
} from '@dorado/components'
import { Inbox, Mail, MessageSquareText } from '@dorado/icons'
import { accountMessageUrl, useAccountMessages, useAuthFakes } from '@dorado/client'

const POLL_MS = 10_000

const timeOf = (sent_at: string) =>
  new Date(sent_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export function MessagesMenu() {
  const [open, setOpen] = useState(false)
  const fakes = useAuthFakes()
  const active = Boolean(fakes.data?.sms || fakes.data?.email)
  const messages = useAccountMessages({
    enabled: active,
    refetchInterval: open ? POLL_MS : false,
  })

  if (!active) return null

  const list = messages.data ?? []

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <Button
          variant="tertiary"
          size="iconSm"
          aria-label="Messages"
          data-testid="messages-menu"
          className="relative"
        >
          <Inbox />
          {list.length > 0 && (
            <Badge
              variant="solid"
              intent="info"
              size="sm"
              className="absolute -right-1 -top-1"
              data-testid="messages-count"
            >
              {list.length}
            </Badge>
          )}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        <MenuLabel>Messages</MenuLabel>
        <MenuSeparator />
        {list.length === 0 && (
          <Text variant="small" emphasis="subtle" className="px-2 py-1">
            No messages yet
          </Text>
        )}
        {list.map((message) => (
          <MenuItem
            key={message.message_id}
            data-testid="messages-item"
            onSelect={() =>
              window.open(accountMessageUrl(message.message_id), '_blank', 'noopener')
            }
            className="flex items-start gap-xs"
          >
            {message.channel === 'email' ? <Mail /> : <MessageSquareText />}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{message.subject ?? message.preview}</span>
              <Text variant="small" emphasis="subtle">
                {timeOf(message.sent_at)}
              </Text>
            </span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}
