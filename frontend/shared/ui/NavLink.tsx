'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { cn } from '@/shared/utils/cn'

/* PRIMARY NAVIGATION LINK — the typography and the active state, in one place.

   THE 3+ RULE (ruling 21) applied to something that was not quite duplicated
   and was worse for it: the desktop Shell put `uppercase tracking-widest` on
   the surrounding `<ul>` and let it inherit; the mobile Sidebar did not carry
   it at all; both then spelled the SAME `text-foreground` /
   `text-muted-foreground hover:text-foreground` pair by hand. Two navigations
   agreeing on colour by coincidence and disagreeing on transform silently is
   exactly the drift a component prevents.

   The transform lives in `.nav-link` (typography.css); the STATE lives here,
   because active-vs-rest is a component concern and not a type utility's.
   `aria-current="page"` is set from the same boolean that picks the colour, so
   the visual state and the assistive one cannot disagree. */
export type NavLinkProps = ComponentProps<typeof Link> & {
  /** True when this link points at the current route. */
  active?: boolean
}

export function NavLink({ active = false, className, ...props }: NavLinkProps) {
  return (
    <Link
      {...props}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'nav-link transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        className
      )}
    />
  )
}

export default NavLink
