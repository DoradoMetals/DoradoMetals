import * as React from 'react'
import { cn } from '../cn'

export type CardProps = React.HTMLAttributes<HTMLDivElement>

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col gap-sm rounded-lg border border-border bg-card p-sm', className)}
    {...props}
  />
))
Card.displayName = 'Card'

export type CardSlotProps = React.HTMLAttributes<HTMLDivElement>

export const CardSlot = React.forwardRef<HTMLDivElement, CardSlotProps>(
  ({ className, children = 'Content', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex w-full items-center justify-center rounded-md border border-border bg-muted p-md text-micro text-muted-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
)
CardSlot.displayName = 'CardSlot'
