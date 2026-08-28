'use client'

import type { ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

/* BANNER — a full-bleed horizontal band that interrupts a page.

   THE PATTERN HAD NO OWNER, and both instances of it were WHITE ON WHITE until
   P3 found them by hand (D95): a `bg-primary` band with `text-white` children,
   which the line-based audit could not see because the two classes sat on
   different elements. `app/page.tsx`'s SupportBanner and
   `features/reviews/ui/ReviewsLandingSection.tsx` were the same three
   decisions - full-bleed band, centred max-width gutter, hairline top and
   bottom - spelled twice and fixed twice.

   Ruling 19 decides what it looks like, and it is deliberately almost nothing:
   one step of surface off the page ground and a hairline on each edge. No
   fill, no shadow, no hue. A band earns attention by INTERRUPTING the column,
   not by being coloured.

   The band is full width and the CONTENT is what gets the gutter, which is why
   there are two elements and two className slots. `className` is the band
   (vertical rhythm); `contentClassName` is the gutter row (its own flex/grid) -
   both layout, both allowed at a call site. Neither takes appearance. */
export type BannerProps = {
  /** Names the landmark. A band is a `<section>`, so it needs one. */
  label: string
  children: ReactNode
  /** Layout on the band itself - vertical padding, margin. */
  className?: string
  /** Layout on the centred gutter - the flex/grid the content sits in. */
  contentClassName?: string
}

export function Banner({ label, children, className, contentClassName }: BannerProps) {
  return (
    <section
      aria-label={label}
      className={cn('w-full bg-card border-y border-border py-4', className)}
    >
      <div className={cn('mx-auto w-full max-w-7xl px-4', contentClassName)}>{children}</div>
    </section>
  )
}

export default Banner
