import type { ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

/* ============================================================================
   DETAIL ROW — a label on the left, a value on the right.
   ----------------------------------------------------------------------------
   The 3+ rule (ruling 21), and this one is well past three: 59 hand-rolled
   copies across 18 files, every one of them

       <div className="w-full flex items-center justify-between">
         <small>Shipping</small>
         a brighter value div holding a PriceNumberFlow
       </div>

   — the same box, the same two type sizes, spelled slightly differently every
   time (`text-sm`/`text-xs`, `text-neutral-600`/`700`, value before label,
   `justify-between` on the parent or on a child). Order summaries, payout
   breakdowns, drawer footers, product specs and the checkout review all draw
   it, and changing how a summary line looks meant finding all 59.

   THE TAGS ARE THE POINT (ruling 22 case 1): the label IS the text, so it is a
   `<p>`, and the value IS the text, so it is a `<strong>`. Both then take
   their size and colour from typography.css and NOTHING here carries a type
   utility — which is what makes the scatter count fall rather than move.

   `total` is a DEGREE, not a second component (the meta-rule under ruling 30):
   the summary line at the bottom of a breakdown is the same row with more
   weight, so it is a prop axis and its value gets `.stat-sm` for tabular
   figures, which the animated NumberFlow totals need.

   `label` is CONTENT — this component supplies the tag. Do not pass a `<p>`.
   ============================================================================ */

export function DetailRow({
  label,
  children,
  total = false,
  className,
}: {
  label: ReactNode
  /** The value. Usually a `<PriceNumberFlow>` or a formatted string. */
  children: ReactNode
  /** The summary line of a breakdown — heavier label, tabular figure. */
  total?: boolean
  /** LAYOUT ONLY — margin, alignment, grid placement. */
  className?: string
}) {
  const Label = total ? 'strong' : 'p'
  return (
    <div className={cn('flex w-full items-center justify-between gap-2', className)}>
      <Label>{label}</Label>
      <strong className={total ? 'stat-sm' : undefined}>{children}</strong>
    </div>
  )
}

export default DetailRow
