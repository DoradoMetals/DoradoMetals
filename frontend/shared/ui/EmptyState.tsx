'use client'

import type { ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'
import type { Icon } from '@phosphor-icons/react'

/* ============================================================================
   EMPTY STATE — an icon, a message, and optionally something to do about it.
   ----------------------------------------------------------------------------
   THERE WERE EIGHT OF THESE. This component, `OrderStatusEmptyState` in
   `features/orders/ui/OrderStatusShared`, and SIX hand-rolled copies of one
   layout found by diffing className strings across the tree - the buy and
   sell drawer panes (since renamed and rebuilt on the checkout items store,
   features/checkout/items/ui/), both checkout steppers' own empty states, and
   the two order-list tabs' "No Orders Yet!" panels.

   All eight are: a large outline icon, a small badge pinned to its corner, a
   heading, a line of copy, and sometimes a button. A badge is CONTENT and an
   action is OPTIONAL — content and a degree, which under the meta-rule beneath
   ruling 30 is one component, not eight.

   THE SIX HAD ALREADY DRIFTED, which is the argument for the component rather
   than a decoration on top of it. Four spelled the badge `border-border` and
   two `border-border-strong` — the two carrying a comment explaining WHY
   `--border-strong` is the right token for an edge that must read as
   deliberate. Headings were `h2` at four and `h3` at two; the body copy was
   `<p>` at some and `<small>` at others; the icon was 128px on the order lists
   and 80px on the two basket panes. Nobody chose any of that. It is what six
   copies of one layout look like after a year.

   FIVE PROPS BECAME ONE CHILD. `buttonLabel`, `buttonIcon`, `buttonIconSize`,
   `buttonVariant` and `buttonClassName` were this component re-declaring
   Button's whole API through a keyhole — and `buttonVariant` still listed the
   RETIRED one-axis names (`default | outline | ghost | destructive`), so the
   one call site was asking for a variant that no longer exists. The action is
   `children` now: a call site passes a real `<Button>` and gets every axis.

   THREE MORE APPEARANCE PROPS DELETED (ruling 20): `iconClassName`,
   `titleClassName`, `descriptionClassName`. Nothing passed them.

   AND THE TYPOGRAPHY WAS SCATTERED HERE WITHOUT SHOWING UP ANYWHERE. The
   title carried `text-lg md:text-xl font-medium text-foreground` and the
   description `text-xs text-muted-foreground leading-relaxed`, both inside `cn()`
   calls — and `lint:typography-scatter` read `className="…"` literals and not
   `cn()` arguments, so this file counted as ZERO while spelling seven type
   utilities. They are an `<h2>` and a `<p>` now (ruling 22, case 1: the
   element IS the text), and both take their size from typography.css.
   ============================================================================ */

export type EmptyStateProps = {
  icon: Icon
  /** 128 on a full page, 80 inside a drawer. A degree, not a second look. */
  iconSize?: number
  /** Pinned to the icon's corner in a hairline bubble. CONTENT: a `0` count,
   *  or a `<SearchX />` for the difference between "you have none" and "none
   *  MATCHED". One bubble treatment, because there was never a reason for two. */
  badge?: ReactNode
  title: string
  description?: string
  /** The action, usually a `<Button>`. Omit where there is nothing to do. */
  children?: ReactNode
  /** LAYOUT ONLY — vertical rhythm, width, grid placement. */
  className?: string
}

export function EmptyState({
  icon: Icon,
  iconSize = 128,
  badge,
  title,
  description,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'w-full px-6 py-10 flex flex-col items-center gap-1 text-center',
        className
      )}
    >
      <div className="relative mb-4">
        <Icon className="text-primary" size={iconSize} strokeWidth={1.5} />
        {badge !== undefined && badge !== null ? (
          /* `--border-strong` is the token for an edge meant to read as
             deliberate, and it is the spelling the two copies that thought
             about it used. The numeral's size and colour come from the tag
             inside, so nothing here paints text. */
          <p className="absolute -top-6 right-3.5 flex h-10 w-10 items-center justify-center rounded-full border border-border-strong">
            {badge}
          </p>
        ) : null}
      </div>

      <h2>{title}</h2>
      {description ? <p className="max-w-xs">{description}</p> : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  )
}

export default EmptyState
