import { createPortal } from 'react-dom'
import { FC, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Anchor = 'left' | 'right'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  children: ReactNode
  anchor?: Anchor
}

const styles = {
  left: "top-20 h-full",
  right: "top-20 h-full",
};

const Drawer: FC<Props> = ({ open, setOpen, children, anchor = 'right' }) => {
  if (typeof document === 'undefined') return null; // Prevent SSR errors

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50"
            onClick={() => setOpen(false)}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: anchor === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: anchor === 'right' ? '100%' : '-100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={`fixed z-50 w-full ${styles[anchor]}`}
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
