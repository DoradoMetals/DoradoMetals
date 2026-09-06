'use client'

import * as React from 'react'
import { Button, cn } from '@dorado/components'
import { ChevronDown } from '@dorado/icons'

export type OrderCardProps = {
  title: React.ReactNode
  right?: React.ReactNode
  summary?: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onToggle?: () => void
  className?: string
  children: React.ReactNode
}

// The chassis every order card wears: card chrome, a title row whose left half
// is the collapse trigger and whose right half holds the badge and the actions,
// and a body that unmounts when closed. Closed keeps the title, the badge and a
// one-line summary; the actions go.
export function OrderCard({
  title,
  right,
  summary,
  defaultOpen = true,
  open,
  onToggle,
  className,
  children,
}: OrderCardProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const isOpen = open ?? uncontrolled
  const toggle = () => {
    if (open === undefined) setUncontrolled((was) => !was)
    onToggle?.()
  }

  return (
    <section
      data-state={isOpen ? 'open' : 'closed'}
      className={cn('overflow-clip rounded-lg border border-border bg-card', className)}
    >
      <div className="flex items-start pr-sm">
        <Button
          type="button"
          variant="tertiary"
          aria-expanded={isOpen}
          onClick={toggle}
          className="mx-0 h-auto min-w-0 flex-1 justify-start gap-xs rounded-none border-transparent p-sm text-left text-body hover:opacity-100"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
              isOpen && 'rotate-180'
            )}
          />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</span>
          {!isOpen && summary != null && (
            <span className="shrink-0 truncate text-small text-muted-foreground opacity-60">
              {summary}
            </span>
          )}
        </Button>
        {right != null && (
          <div className="flex shrink-0 items-center gap-xs pt-sm">{right}</div>
        )}
      </div>
      {isOpen && (
        <div className="flex flex-col gap-md px-md pt-2xs pb-md">{children}</div>
      )}
    </section>
  )
}

// One label/figure line, the shape every summary card in the file is built of.
export function CardRow({
  label,
  value,
  strong = false,
}: {
  label: React.ReactNode
  value: React.ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex w-full items-center justify-between gap-md">
      <p className={cn('text-small', strong ? 'font-medium text-foreground' : 'text-muted-foreground')}>
        {label}
      </p>
      <p className="text-right text-small font-medium text-foreground">{value}</p>
    </div>
  )
}

export function CardHairline() {
  return <div className="h-px w-full bg-border" />
}

// A label above a value, the "Account name / Marguerite Whitfield" pair the
// Payment and fulfillment cards use across a row.
export function CardFact({
  label,
  value,
  align = 'start',
}: {
  label: React.ReactNode
  value: React.ReactNode
  align?: 'start' | 'end'
}) {
  return (
    <div className={cn('flex flex-col gap-3xs', align === 'end' && 'items-end text-right')}>
      <p className="text-small text-muted-foreground">{label}</p>
      <p className="text-small font-medium text-foreground">{value}</p>
    </div>
  )
}
