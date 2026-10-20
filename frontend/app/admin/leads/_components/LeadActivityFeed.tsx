'use client'

import * as React from 'react'
import { Avatar, Card, Skeleton, Text } from '@dorado/components'
import type { ActivityEntry } from '@dorado/contracts'

import { formatRelative, initialsOf } from '../_lib'

export type LeadActivityFeedProps = {
  entries: ActivityEntry[] | undefined
  className?: string
}

export function LeadActivityFeed({ entries, className }: LeadActivityFeedProps) {
  return (
    <Card data-testid="lead-activity" className={className}>
      <Text variant="small" className="text-muted-foreground">
        Activity
      </Text>
      {entries === undefined ? (
        <div role="status" aria-label="Loading activity" className="flex flex-col gap-sm">
          <Skeleton />
          <Skeleton />
        </div>
      ) : entries.length === 0 ? (
        <Text variant="small" className="text-muted-foreground">
          Nothing yet
        </Text>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((entry) => (
            <li key={`${entry.at}-${entry.subject_id}-${entry.kind}`} className="flex gap-sm py-sm">
              <Avatar size="sm" fallback={initialsOf(entry.actor_name)} />
              <div className="flex min-w-0 flex-col gap-3xs">
                <Text variant="small">{entry.summary}</Text>
                <Text variant="micro" className="text-muted-foreground">
                  {`${entry.actor_name} · ${formatRelative(entry.at)}`}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
