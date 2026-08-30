'use client'

import { Accordion } from '@dorado/components'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

// The app's face of @dorado/components' Accordion: same six call sites, same
// props, the rendering now the library's. What this file still owns is the
// MONEY - a `total`/`negative` pair rendered through PriceNumberFlow - because
// money formatting is this app's business and deliberately not the library's
// (the library takes a `trailing` slot and knows nothing).
//
// THE OLD VARIANTS MAP, THEY DID NOT SURVIVE: `plain` (transparent, for
// sitting on a drawer footer that is already a card) is the library's `bare`;
// `card` is the library's `card`, which is the treatment the Figma draws. The
// eyebrow label the card variant used to render is gone with the brand
// refresh - the drawing says Body/Medium at foreground, and the library owns
// that now. The chevron also moved from trailing to LEADING, per the drawing;
// the total keeps the right edge.
//
// framer-motion left this file: the library animates with the CSS grid-rows
// trick, both directions, honouring motion-reduce - which AnimatePresence was
// not doing.
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
  variant?: 'plain' | 'card'
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
  return (
    <Accordion
      label={label}
      surface={variant === 'card' ? 'card' : 'bare'}
      open={open}
      onToggle={onToggle}
      defaultOpen={defaultOpen}
      trailing={
        total !== undefined ? (
          <>
            {negative && '-'}
            <PriceNumberFlow value={total} />
          </>
        ) : undefined
      }
    >
      {children}
    </Accordion>
  )
}
