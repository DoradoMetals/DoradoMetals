import { createPortal } from 'react-dom'
import { FC, ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/shared/utils/cn'

type Anchor = 'left' | 'right'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  children: ReactNode
  anchor?: Anchor
  className?: string
  /**
   * What this drawer is showing, e.g. "User". Becomes its accessible name.
   * Optional so no existing caller breaks, but every caller should pass one.
   */
  label?: string
}

// A DRAWER IS A DIALOG, AND HAD NONE OF THE SEMANTICS OF ONE.
//
// This rendered two bare motion.divs into a portal: no role, no aria-modal, no
// accessible name, and no way to close it from the keyboard. To assistive
// technology it was an anonymous region that appeared somewhere in the document
// - not announced as a dialog, and the content behind it still reachable.
//
// It is also every drawer in the admin area. Twelve of them - users, leads,
// products, reviews, carriers, carrier services, purchase orders, sales orders,
// addresses, cart - all mount through this one component, which is where every
// record in the business is opened and edited.
//
// Found while writing a test that waits for a drawer to appear and could not
// name one, which is exactly the difficulty a screen reader has.
const Drawer: FC<Props> = ({
  open,
  setOpen,
  children,
  anchor = 'right',
  className = 'glass-panel',
  label,
}) => {
  // Escape closes it. A modal that can only be dismissed by clicking a specific
  // region is unusable without a mouse.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50"
            onClick={() => setOpen(false)}
            // Decorative: the dialog below carries the semantics, and a
            // screen reader announcing the backdrop would be noise.
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label ? `${label} details` : 'Details'}
            initial={{ x: anchor === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: anchor === 'right' ? '100%' : '-100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={cn(
              'drawer-layout custom-scrollbar',
              anchor === 'right' ? 'right-0' : 'left-0',
              className
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body as HTMLElement
  )
}

export default Drawer
