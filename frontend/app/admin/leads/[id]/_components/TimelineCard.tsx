'use client'

import * as React from 'react'
import { Text } from '@dorado/components'
import { Mail, MessageSquare, Pencil, Phone } from '@dorado/icons'
import type { LeadTimeline } from '@dorado/contracts'

import { formatStamp } from '@/shared/utils/formatStamp'

import { LeadSection } from './LeadSection'

const ICONS: Record<string, React.ElementType> = {
  call: Phone,
  sms: MessageSquare,
  text: MessageSquare,
  email: Mail,
}

export type TimelineCardProps = {
  since: string
  events: LeadTimeline[] | undefined
  failed: boolean
  onRetry: () => void
}

export function TimelineCard({ since, events, failed, onRetry }: TimelineCardProps) {
  return (
    <LeadSection
      name="timeline"
      title="Timeline"
      trailing={since}
      state={failed ? 'error' : events === undefined ? 'loading' : 'ready'}
      errorTitle="Couldn't load the timeline"
      onRetry={onRetry}
    >
      {events && events.length === 0 ? (
        <Text variant="small" className="text-muted-foreground">
          Nothing yet
        </Text>
      ) : (
        <ul className="flex flex-col gap-md">
          {(events ?? []).map((event, index) => {
            const Icon = ICONS[event.kind] ?? Pencil
            const who = event.actor_name ?? 'Dorado'
            return (
              <li key={`${event.at}-${index}`} className="flex items-start gap-sm">
                <Icon aria-hidden className="mt-3xs size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-3xs">
                  <Text variant="small-medium">{event.summary}</Text>
                  <Text variant="micro" className="text-muted-foreground">
                    {event.detail ? `${who} · ${event.detail}` : who}
                  </Text>
                </div>
                <Text variant="micro" className="shrink-0 text-muted-foreground">
                  {formatStamp(event.at)}
                </Text>
              </li>
            )
          })}
        </ul>
      )}
    </LeadSection>
  )
}
