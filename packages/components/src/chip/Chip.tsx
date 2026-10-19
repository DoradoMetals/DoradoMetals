'use client'

import * as React from 'react'
import { X } from '@dorado/icons'
import { cn } from '../cn'
import { Button } from '../button/Button'

export type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: React.ReactNode
  selected?: boolean
  onDismiss?: () => void
  icon?: React.ReactNode
  avatar?: React.ReactNode
  count?: number
}

export function Chip({
  label,
  selected = false,
  onDismiss,
  icon,
  avatar,
  count,
  className,
  disabled,
  role,
  ...props
}: ChipProps) {
  const isRadio = role === 'radio'
  const chrome = cn(
    'inline-flex min-h-(--control-sm) items-center gap-2xs rounded-full px-sm text-small font-medium transition-colors',
    selected
      ? 'bg-primary text-primary-foreground hover:opacity-85'
      : 'border border-border bg-card text-muted-foreground hover:border-border-strong hover:bg-accent hover:text-foreground'
  )
  const content = (
    <>
      {avatar != null ? (
        <span className="-ml-2xs-plus flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full [&_img]:size-full [&_img]:object-cover">
          {avatar}
        </span>
      ) : icon != null ? (
        <span className="shrink-0 [&_svg]:size-3">{icon}</span>
      ) : null}
      {label}
      {count != null && <span className="text-micro tabular-nums opacity-70">{count}</span>}
    </>
  )
  const toggle = (
    <button
      type="button"
      role={role}
      aria-pressed={isRadio ? undefined : selected}
      aria-checked={isRadio ? selected : undefined}
      disabled={disabled}
      className={cn(
        'cursor-pointer focus-ring disabled:pointer-events-none',
        onDismiss
          ? 'inline-flex items-center gap-2xs rounded-full'
          : cn(chrome, 'disabled:opacity-50', className)
      )}
      {...props}
    >
      {content}
    </button>
  )
  if (!onDismiss) return toggle
  return (
    <span className={cn(chrome, disabled && 'pointer-events-none opacity-50', className)}>
      {toggle}
      <Button
        variant="tertiary"
        size="iconXs"
        hitArea={false}
        disabled={disabled}
        aria-label={`Remove ${typeof label === 'string' ? label : 'chip'}`}
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        className="-mr-2xs size-4"
      >
        <X aria-hidden className="size-3.5" />
      </Button>
    </span>
  )
}
