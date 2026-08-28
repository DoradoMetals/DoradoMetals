'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/shared/utils/cn'

/* The call-site rule is stated in full in base/button.tsx. Short form:
   a call site's className is LAYOUT ONLY. Appearance is this file's job.

   ----------------------------------------------------------------------------
   THE `underline` VARIANT — what it absorbs, and why it had to exist.
   ----------------------------------------------------------------------------
   Six call sites across three partitions (app/sell x2, features/cart,
   features/auth x2) spelled `className="tab-indicator-primary"`, a class in
   `gradients.css` that ruling 16 deletes. It is not decoration: it is the
   ENTIRE look of a tab bar - transparent trigger, no pill, muted at rest,
   near-white when active, and a 1px rule underneath the active one. Without a
   variant to receive it, `gradients.css` could not be emptied and the whole
   file could not be removed, so this one variant was blocking a file deletion
   three partitions wide.

   It absorbs `bg-transparent rounded-none` on the list and the whole
   `tab-indicator-*` class on the trigger. Call sites keep only their layout:
   `w-full`, `gap-2`, `justify-center`, margins.

   `underlineSubtle` exists for the single `tab-indicator-secondary` call site
   (`features/cart/ui/CartTabs.tsx:52`), which draws the rule in
   `--border-strong` instead of `--primary`. NOTE FOR P1: that file uses the
   SUBTLE indicator on "Buy" and the primary one on "Sell", so its two tabs
   have different active treatments. That looks like an accident rather than a
   decision, but changing it is a visual change in another partition's file, so
   both variants exist and the call is left to whoever owns CartTabs. */

const tabsListVariants = cva('inline-flex items-center', {
  variants: {
    variant: {
      default:
        'bg-muted text-muted-foreground h-9 w-fit justify-center rounded-lg p-1',
      /* No bar, no fill - the rules under the triggers ARE the affordance. */
      underline: 'bg-transparent rounded-none h-auto p-0',
    },
  },
  defaultVariants: { variant: 'default' },
})

const tabsTriggerVariants = cva(
  "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'data-[state=active]:text-foreground rounded-md py-1 text-small data-[state=active]:shadow-sm',
        /* The rule is an ::after so the trigger's own box never resizes when it
           becomes active - a border-bottom would shift every sibling by 1px.
           `after:content-['']` is spelled explicitly rather than relying on the
           variant's implicit default, because a pseudo-element with no content
           does not render at all and the failure is silent. */
        underline: [
          'relative cursor-pointer rounded-none bg-transparent py-1 text-small text-neutral-600 shadow-none',
          'data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground',
          "after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-px after:bg-transparent after:transition-colors",
          'data-[state=active]:after:bg-primary',
        ].join(' '),
        underlineSubtle: [
          'relative cursor-pointer rounded-none bg-transparent py-1 text-small text-neutral-600 shadow-none',
          'data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground',
          "after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-px after:bg-transparent after:transition-colors",
          'data-[state=active]:after:bg-border-strong',
        ].join(' '),
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof tabsTriggerVariants>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('w-full h-full flex flex-col', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants }
