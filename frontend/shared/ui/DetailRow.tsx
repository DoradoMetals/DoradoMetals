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
   time (`text-sm`/`text-xs`, `text-muted-foreground`/`700`, value before label,
   `justify-between` on the parent or on a child). Order summaries, payout
   breakdowns, drawer footers, product specs and the checkout review all draw
   it, and changing how a summary line looks meant finding all 59.

   THE TAGS ARE THE POINT (ruling 22 case 1): the label IS the text, so it is a
   `<p>`, and the value IS the text, so it is a `<strong>`. Both then take
   their size and colour from typography.css and NOTHING here carries a type
   utility — which is what makes the scatter count fall rather than move.

   ──────────────────────────────────────────────────────────────────────────
   THE `total` BOOLEAN IS NOW A FOUR-STEP AXIS, and that is FEWER concepts
   rather than more. Wave 4 stopped at 31 adoptions and left 47 rows alone,
   reasoning that they were "already semantic and layout-only". Two halves of
   that were wrong:

     * the `pl-4`/`pl-8` indent hierarchy it was protecting is LAYOUT, and
       `className` already carries layout, so nothing was ever going to flatten;
     * the sizes were not arbitrary. Sorted, the 47 rows spell exactly FOUR
       combinations, and they form a monotone ramp — each step makes exactly
       one of the two elements heavier:

           detail    <small> / <p>        a line inside a nested breakdown
           subtotal  <small> / <strong>   that breakdown's own total
           row       <p>     / <strong>   an ordinary summary line  (default)
           total     <strong>/ <strong>   the grand total, tabular figures

   So it is ONE axis of degree, which is what the meta-rule beneath ruling 30
   permits, and not four components or a pair of booleans whose four
   combinations include two nobody wants.

   `label` is CONTENT — this component supplies the tag. Do not pass a `<p>`.
   ============================================================================ */

export type DetailRowVariant = 'detail' | 'subtotal' | 'row' | 'total'

const TAGS = {
  detail: ['small', 'p'],
  subtotal: ['small', 'strong'],
  row: ['p', 'strong'],
  total: ['strong', 'strong'],
} as const

export function DetailRow({
  label,
  children,
  variant = 'row',
  className,
}: {
  label: ReactNode
  /** The value. Usually a `<PriceNumberFlow>` or a formatted string. */
  children: ReactNode
  /** The step of the ramp. See the table above. */
  variant?: DetailRowVariant
  /** LAYOUT ONLY — margin, indent, alignment, grid placement. */
  className?: string
}) {
  const [Label, Value] = TAGS[variant]
  return (
    <div className={cn('flex w-full items-center justify-between gap-2', className)}>
      <Label>{label}</Label>
      {/* `.stat-sm` is tabular figures, which the animated NumberFlow grand
          total needs so its digits stop shifting as they count. */}
      <Value className={variant === 'total' ? 'stat-sm' : undefined}>{children}</Value>
    </div>
  )
}

export default DetailRow
