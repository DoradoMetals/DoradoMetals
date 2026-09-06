import * as React from 'react'
import { cn } from '../cn'

export type MessageDirection = 'inbound' | 'outbound'
export type MessageStatus = 'delivered' | 'sending' | 'failed'

export type MessageProps = {
  direction: MessageDirection
  status?: MessageStatus
  time: React.ReactNode
  children: React.ReactNode
  className?: string
}

const STATUS_LABEL: Record<MessageStatus, string> = {
  delivered: 'Delivered',
  sending: 'Sending…',
  failed: 'Not delivered, tap to retry',
}

export function Message({ direction, status = 'delivered', time, children, className }: MessageProps) {
  const outbound = direction === 'outbound'
  return (
    <div
      className={cn('flex w-full flex-col gap-2xs', outbound ? 'items-end' : 'items-start', className)}
    >
      <div
        className={cn(
          'max-w-[296px] rounded-xl px-sm py-xs text-small',
          outbound ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {children}
      </div>
      <span className="flex items-center gap-3xs text-micro text-muted-foreground">
        <span>{time}</span>
        {outbound && (
          <span className={cn(status === 'failed' && 'text-destructive')}>
            {'· ' + STATUS_LABEL[status]}
          </span>
        )}
      </span>
    </div>
  )
}
