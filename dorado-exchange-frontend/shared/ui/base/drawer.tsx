import { createPortal } from 'react-dom'
import { FC, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/shared/utils/cn'

type Anchor = 'left' | 'right'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  children: ReactNode
  anchor?: Anchor
  className?: string
}

const Drawer: FC<Props> = ({ open, setOpen, children, anchor = 'right', className }) => {
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
          />

          <motion.div
            initial={{ x: anchor === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: anchor === 'right' ? '100%' : '-100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={cn(
              'drawer-layout',
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
