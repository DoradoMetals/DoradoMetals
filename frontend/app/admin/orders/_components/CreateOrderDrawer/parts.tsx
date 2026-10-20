'use client'

import * as React from 'react'
import { RadioOption, Text, cn } from '@dorado/components'

export function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn('flex flex-col gap-sm border-b border-border pb-md last:border-b-0', className)}
    >
      <h3 className="text-h6 text-foreground">{title}</h3>
      {children}
    </section>
  )
}

export function Tile({
  value,
  title,
  description,
  icon,
  disabled,
}: {
  value: string
  title: string
  description: string
  icon?: React.ReactNode
  disabled?: boolean
}) {
  return (
    <RadioOption value={value} variant="card" disabled={disabled} className="w-full">
      <span className="flex flex-col gap-3xs">
        <span className="flex items-center gap-xs text-small font-medium text-foreground">
          {icon}
          {title}
        </span>
        <Text variant="micro" className="text-muted-foreground">
          {description}
        </Text>
      </span>
    </RadioOption>
  )
}

export function Chip({
  value,
  label,
  disabled,
}: {
  value: string
  label: string
  disabled?: boolean
}) {
  return (
    <RadioOption value={value} variant="chip" disabled={disabled}>
      {label}
    </RadioOption>
  )
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-sm text-small">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  )
}
