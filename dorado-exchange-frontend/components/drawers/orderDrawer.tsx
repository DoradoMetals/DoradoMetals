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
  left: 'h-full top-26 sm:top-0',
  right: 'h-screen top-26 sm:top-0',
}

const OrderDrawer: FC<Props> = ({ open, setOpen, children, anchor = 'right' }) => {
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 sm:bg-black z-[60]"
            onClick={() => setOpen(false)}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: '0%' }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={`fixed right-0 top-26 sm:top-0 z-[70] h-full w-full sm:w-1/4 bg-card sm:shadow-lg`}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body as HTMLElement
  )
}

export default OrderDrawer
