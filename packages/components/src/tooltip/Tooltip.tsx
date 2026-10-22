'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../cn'

export const TooltipProvider = TooltipPrimitive.Provider

// Tooltip 32:177. Label is the one-line hint (Small/Regular); content is the
// children passthrough slot (2026-10-16) a feature fills with its own
// component. Feature content never lives here.
export type TooltipProps = {
  label?: React.ReactNode
  content?: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
  delayDuration?: number
}

export function Tooltip({
  label,
  content,
  side = 'top',
  children,
  delayDuration = 300,
}: TooltipProps) {
  if (label == null && content == null) return <>{children}</>
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-100 flex flex-col gap-xs rounded-sm border border-border bg-highest px-sm py-xs text-foreground',
            'data-[state=delayed-open]:animate-in motion-reduce:animate-none'
          )}
        >
          {label != null && <p className="text-small text-foreground">{label}</p>}
          {content}

          <TooltipPrimitive.Arrow width={12} height={6} className="fill-highest" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
