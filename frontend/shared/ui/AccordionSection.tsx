'use client'

import { useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

// The collapsible label + optional-total section, hand-rolled in each of the
// four order-drawer footers and again on the product page - the reverse of the
// 3+ rule: five call sites re-implementing something shared/ui already had.
//
// `variant` is a DEGREE OF PROMINENCE, not two components: the same section,
// unfilled in a drawer footer and filled on a product page. Its values used to
// be named `glass` and `raised` after a glassmorphism and a shadow that were
// both deleted (MANUAL-VERIFICATION.md 5.5); they now say what they are.
//
// NO TYPE UTILITIES HERE. The header's label is a `<strong>` (plain) or an
// `.eyebrow` (card) and the total is a `<strong>`, so both take their size
// from typography.css and a heading size still changes in one place.
const VARIANTS = {
  plain: {
    container: 'rounded-md border border-border bg-transparent',
    header: 'w-full p-2 flex justify-between items-center cursor-pointer',
    content: 'p-2 pr-9',
  },
  card: {
    container: 'rounded-md bg-card border border-border p-2',
    header: 'w-full p-2 flex justify-between items-center cursor-pointer',
    content: 'p-2',
  },
} as const

type AccordionSectionProps = {
  label: string
  /** Renders a price on the right of the header when provided. */
  total?: number
  /** Renders a minus sign in front of the total (fees, charges). */
  negative?: boolean
  /** Controlled open state; omit both `open` and `onToggle` to self-manage. */
  open?: boolean
  onToggle?: () => void
  /** Initial state when self-managed. */
  defaultOpen?: boolean
  variant?: keyof typeof VARIANTS
  children: React.ReactNode
}

export default function AccordionSection({
  label,
  total,
  negative = false,
  open,
  onToggle,
  defaultOpen = false,
  variant = 'plain',
  children,
}: AccordionSectionProps) {
  const [selfOpen, setSelfOpen] = useState(defaultOpen)
  const isOpen = open ?? selfOpen
  const toggle = onToggle ?? (() => setSelfOpen((prev) => !prev))
  const styles = VARIANTS[variant]

  const chevron = (
    <ChevronDown
      className={cn('h-4 w-4 transition-transform text-neutral-600', isOpen && 'rotate-180')}
      size={20}
    />
  )

  return (
    <div className={styles.container}>
      <button type="button" onClick={toggle} className={styles.header}>
        {variant === 'card' ? (
          <span className="eyebrow">{label}</span>
        ) : (
          <strong>{label}</strong>
        )}
        {total !== undefined ? (
          <span className="flex items-center gap-2">
            <strong>
              {negative && '-'}
              <PriceNumberFlow value={total} />
            </strong>
            {chevron}
          </span>
        ) : (
          chevron
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden will-change-transform"
          >
            <div className={styles.content}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
