'use client'

import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

import { cn } from '../cn'

export type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  orientation?: 'vertical' | 'horizontal' | 'both'
  chrome?: boolean
}

const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(
  (
    { className, children, orientation = 'vertical', type = 'hover', chrome = true, ...props },
    ref
  ) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      type={type}
      className={cn(
        'relative overflow-hidden',
        chrome && 'rounded-lg border border-border bg-card',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className={cn(
          'size-full rounded-[inherit]',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background'
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {(orientation === 'vertical' || orientation === 'both') && (
        <ScrollBar orientation="vertical" />
      )}
      {(orientation === 'horizontal' || orientation === 'both') && (
        <ScrollBar orientation="horizontal" />
      )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
)
ScrollArea.displayName = 'ScrollArea'

const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none rounded-full p-0.5 transition-opacity',
      'data-[state=hidden]:opacity-0 motion-reduce:transition-none',
      orientation === 'vertical' && 'my-0.5 mr-0.5 h-[calc(100%-0.25rem)] w-2',
      orientation === 'horizontal' && 'mx-0.5 mb-0.5 h-2 w-[calc(100%-0.25rem)] flex-col',
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-muted" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = 'ScrollBar'

export { ScrollArea, ScrollBar }
