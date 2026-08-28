'use client'

import { useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

// The collapsible label + optional-total section that was hand-rolled in each
// order drawer footer and the product page. Styling is copied as-is from the
// two specimens; `variant` picks between them:
//   - 'glass' - the order-drawer footer look (hairline-bordered, total on the
//                right, content inset with pr-9)
//   - 'raised' - the product-page look (raised card, uppercase tracked label)
const VARIANTS = {
  glass: {
    container: 'rounded-md border border-border bg-transparent',
    header: 'w-full p-2 flex justify-between items-center text-sm font-normal cursor-pointer',
    content: 'p-2 pr-9',
  },
  raised: {
    container: 'rounded-md bg-card border border-border p-2',
    header:
      'w-full p-2 flex justify-between items-center tracking-widest uppercase text-xs lg:text-sm text-neutral-600 font-normal cursor-pointer',
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
  variant = 'glass',
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
        {label}
        {total !== undefined ? (
          <div className="flex items-center gap-2 text-base">
            {negative ? (
              <div className="flex items-center gap-0">
                -<PriceNumberFlow value={total} />
              </div>
            ) : (
              <PriceNumberFlow value={total} />
            )}
            <div className="text-base"></div>
            {chevron}
          </div>
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
