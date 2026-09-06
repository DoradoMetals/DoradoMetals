import * as React from 'react'
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing } from '@dorado/icons'
import { cn } from '../cn'

export type CallKind = 'outgoing' | 'no-answer' | 'incoming' | 'missed'

export type CallEventProps = {
  kind: CallKind
  detail?: React.ReactNode
  time: React.ReactNode
  className?: string
}

const KIND_ICON: Record<CallKind, React.ElementType> = {
  outgoing: PhoneOutgoing,
  'no-answer': Phone,
  incoming: PhoneIncoming,
  missed: PhoneMissed,
}

const KIND_LABEL: Record<CallKind, string> = {
  outgoing: 'Outgoing call',
  'no-answer': 'Outgoing call',
  incoming: 'Incoming call',
  missed: 'Missed call',
}

const STATIC_DETAIL: Partial<Record<CallKind, React.ReactNode>> = { 'no-answer': 'No answer' }

export function CallEvent({ kind, detail, time, className }: CallEventProps) {
  const Icon = KIND_ICON[kind]
  const danger = kind === 'missed'
  const shown = kind === 'missed' ? undefined : (STATIC_DETAIL[kind] ?? detail)
  return (
    <div className={cn('flex w-full items-center gap-sm py-xs', className)}>
      <Icon
        aria-hidden
        className={cn('size-4 shrink-0', danger ? 'text-destructive' : 'text-muted-foreground')}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate text-small font-medium',
            danger ? 'text-destructive' : 'text-foreground'
          )}
        >
          {KIND_LABEL[kind]}
        </span>
        <span className="flex items-center gap-3xs text-micro text-muted-foreground">
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
