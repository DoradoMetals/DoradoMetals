import * as React from 'react'
import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from '@dorado/icons'
import { cn } from '../cn'

export type CallKind = 'outgoing' | 'no-answer' | 'incoming' | 'missed'

export type CallEventProps = {
  kind: CallKind
  detail?: React.ReactNode
  time: React.ReactNode
  agent?: React.ReactNode
  className?: string
}

export function CallEvent({ kind, detail, time, agent, className }: CallEventProps) {
  const missed = kind === 'missed'
  const Icon = missed ? PhoneMissed : kind === 'incoming' ? PhoneIncoming : PhoneOutgoing
  const label = missed ? 'Missed call' : kind === 'incoming' ? 'Incoming call' : 'Outgoing call'
  const shown = missed ? undefined : kind === 'no-answer' ? 'No answer' : detail
  return (
    <div className={cn('flex w-full items-center gap-sm border-b border-border py-xs', className)}>
      <Icon
        aria-hidden
        className={cn('size-4 shrink-0', missed ? 'text-destructive' : 'text-muted-foreground')}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate text-small font-medium',
            missed ? 'text-destructive' : 'text-foreground'
          )}
        >
          {label}
        </span>
        <span className="flex items-center gap-3xs text-micro text-muted-foreground">
          {agent != null && (
            <>
              <span>{agent}</span>
              <span aria-hidden>·</span>
            </>
          )}
          {shown != null && (
            <>
              <span>{shown}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>{time}</span>
        </span>
      </span>
    </div>
  )
}
