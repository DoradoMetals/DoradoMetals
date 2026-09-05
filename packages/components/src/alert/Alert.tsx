'use client'

import * as React from 'react'
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from '@dorado/icons'

import { Button } from '../button/Button'
import { cva } from 'class-variance-authority'
import { cn } from '../cn'

const alertVariants = cva('flex w-full items-start gap-2 rounded-lg border p-3', {
  variants: {
    intent: {
      neutral: 'border-border bg-card',
      success: 'border-success bg-success-muted',
      danger: 'border-destructive bg-destructive-muted',
      warning: 'border-warning bg-warning-muted',
      info: 'border-info bg-info-muted',
    },
  },
  defaultVariants: { intent: 'neutral' },
})

const TITLE = {
  neutral: 'text-foreground',
  success: 'text-success',
  danger: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
} as const

const ICONS = {
  neutral: Info,
  success: CheckCircle2,
  danger: CircleAlert,
  warning: TriangleAlert,
  info: Info,
} as const

export type AlertIntent = keyof typeof TITLE

export type AlertProps = {
  intent?: AlertIntent
  title: React.ReactNode
  children?: React.ReactNode
  icon?: React.ReactNode | false
  onDismiss?: () => void
  className?: string
}

export function Alert({
  intent = 'neutral',
  title,
  children,
  icon,
  onDismiss,
  className,
}: AlertProps) {
  const DefaultIcon = ICONS[intent]
  return (
    <div
      role={intent === 'danger' || intent === 'warning' ? 'alert' : 'status'}
      className={cn(alertVariants({ intent }), className)}
    >
      {icon !== false && (
        <span className={cn('mt-[2px] shrink-0', TITLE[intent])}>
          {icon ?? <DefaultIcon aria-hidden className="size-7" />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <small className={TITLE[intent]}>{title}</small>
        {children != null && (
          <small data-emphasis={intent === 'neutral' ? undefined : 'default'}>{children}</small>
        )}
      </span>
      {onDismiss && (
        <Button
          variant="tertiary"
          intent={intent}
          size="iconXs"
          aria-label="Dismiss"
          className="-mr-1 shrink-0 self-center"
          onClick={onDismiss}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  )
}
