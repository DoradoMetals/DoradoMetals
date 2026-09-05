'use client'

import * as React from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from '@dorado/icons'
import { Button } from '../button/Button'
import { cn } from '../cn'

const SURFACES = {
  card: 'bg-card border border-border',
  bare: 'border border-border bg-transparent',
} as const

export type AccordionProps = {
  label: React.ReactNode
  trailing?: React.ReactNode
  chevron?: 'leading' | 'trailing'
  open?: boolean
  onToggle?: () => void
  defaultOpen?: boolean
  disabled?: boolean
  surface?: keyof typeof SURFACES
  className?: string
  children: React.ReactNode
}

export function Accordion({
  label,
  trailing,
  chevron = 'leading',
  open,
  onToggle,
  defaultOpen = false,
  disabled = false,
  surface = 'card',
  className,
  children,
}: AccordionProps) {
  const controlled = open !== undefined
  const chevronTrailing = chevron === 'trailing' && trailing == null

  const marker = (
    <ChevronDown
      aria-hidden
      className={cn(
        'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
        'group-data-[state=open]:rotate-180'
      )}
    />
  )

  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      disabled={disabled}
      {...(controlled
        ? { value: open ? 'it' : '', onValueChange: () => onToggle?.() }
        : { defaultValue: defaultOpen ? 'it' : undefined })}
      className={cn(
        'rounded-lg overflow-clip',
        SURFACES[surface],
        disabled && 'opacity-50',
        className
      )}
    >
      <AccordionPrimitive.Item value="it">
        <AccordionPrimitive.Header asChild>
          <AccordionPrimitive.Trigger asChild>
            <Button
              variant="tertiary"
              className="group mx-0 h-auto w-full justify-start gap-2 rounded-none border-transparent p-3 text-left text-body hover:bg-accent hover:opacity-100 disabled:opacity-100"
            >
              {chevronTrailing ? null : marker}
              <span className="min-w-0 flex-1 font-medium text-foreground">{label}</span>
              {trailing != null && (
                <span className="shrink-0 font-medium text-foreground">{trailing}</span>
              )}
              {chevronTrailing ? marker : null}
            </Button>
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content
          className={cn(
            'overflow-hidden',
            'data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up',
            'motion-reduce:animate-none'
          )}
        >
          <div className="pb-3 pl-4 pr-3">{children}</div>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  )
}
