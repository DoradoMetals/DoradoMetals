'use client'

import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useId, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X } from '@dorado/icons'
import { cn } from '../cn'
import { Button } from '../button/Button'
import { useFocusTrap } from '../hooks/useFocusTrap'

type DrawerContextValue = {
  titleId: string
  setTitled: (titled: boolean) => void
  close: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

type DrawerAnchor = 'left' | 'right' | 'bottom'
type DrawerSurface = 'highest' | 'card' | 'none'
export type DrawerSize = 'sm' | 'md' | 'lg' | 'full'

const SIZE_WIDTH: Record<DrawerSize, string> = {
  sm: 'w-full sm:w-(--drawer-sm)',
  md: 'w-full sm:w-(--drawer-md)',
  lg: 'w-full sm:w-(--drawer-lg)',
  full: 'w-full',
}

export type DrawerProps = {
  open: boolean
  setOpen: (open: boolean) => void
  children: ReactNode
  anchor?: DrawerAnchor
  surface?: DrawerSurface
  size?: DrawerSize
  className?: string
  label?: string
  'aria-describedby'?: string
}

export function Drawer({
  open,
  setOpen,
  children,
  anchor = 'right',
  surface = 'card',
  size,
  className,
  label,
  'aria-describedby': describedBy,
}: DrawerProps) {
  const shouldReduceMotion = useReducedMotion()
  const panelRef = useFocusTrap<HTMLDivElement>(open)
  const isBottom = anchor === 'bottom'
  const titleId = useId()
  const [titled, setTitled] = useState(false)

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
            transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
            className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titled ? titleId : undefined}
            aria-label={titled ? undefined : label ? `${label} details` : 'Details'}
            aria-describedby={describedBy}
            initial={isBottom ? { y: '100%' } : { x: anchor === 'right' ? '100%' : '-100%' }}
            animate={isBottom ? { y: 0 } : { x: 0 }}
            exit={isBottom ? { y: '100%' } : { x: anchor === 'right' ? '100%' : '-100%' }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeInOut' }}
            drag={isBottom ? 'y' : false}
            dragConstraints={isBottom ? { top: 0, bottom: 0 } : undefined}
            dragElastic={isBottom ? { top: 0, bottom: 0.6 } : undefined}
            onDragEnd={
              isBottom
                ? (_event, info) => {
                    if (info.offset.y > 80 || info.velocity.y > 500) setOpen(false)
                  }
                : undefined
            }
            className={cn(
              isBottom
                ? [
                    'fixed inset-x-0 bottom-0 max-h-[85vh]',
                    'rounded-t-xl',
                    'overflow-hidden',
                    'flex flex-col',
                  ]
                : size
                  ? [
                      'fixed inset-y-0 max-w-full',
                      'overflow-hidden',
                      'flex flex-col',
                      SIZE_WIDTH[size],
                      anchor === 'right' ? 'right-0' : 'left-0',
                    ]
                  : [
                      'fixed top-23 bottom-0 sm:top-0',
                      'overflow-hidden',
                      'flex flex-col',
                      'w-full sm:w-1/2 md:w-1/2 lg:w-2/5 xl:w-1/4',
                      'max-w-full sm:max-w-1/2 md:max-w-1/2 lg:max-w-2/5 xl:max-w-1/4',
                      anchor === 'right' ? 'right-0' : 'left-0',
                    ],
              'z-[70] will-change-transform',
              '[scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent]',
              // Default card surface (Library 2026-10-19); both fills keep the
              // single hairline on the attached edge.
              surface !== 'none' &&
                cn(
                  surface === 'highest' ? 'bg-highest' : 'bg-card',
                  'border-border',
                  isBottom ? 'border-t' : anchor === 'right' ? 'border-l' : 'border-r'
                ),
              className
            )}
          >
            {isBottom && (
              <div
                className="flex shrink-0 items-center justify-center pb-3xs pt-xs"
                aria-hidden="true"
              >
                <div className="h-2xs w-9 rounded-full bg-border-strong" />
              </div>
            )}
            <DrawerContext.Provider value={{ titleId, setTitled, close: () => setOpen(false) }}>
              {children}
            </DrawerContext.Provider>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body as HTMLElement
  )
}

export type DrawerHeaderProps = {
  title: ReactNode
  actions?: ReactNode
  closeLabel?: string
  className?: string
}

export function DrawerHeader({
  title,
  actions,
  closeLabel = 'Close',
  className,
}: DrawerHeaderProps) {
  const ctx = useContext(DrawerContext)
  const setTitled = ctx?.setTitled

  useEffect(() => {
    if (!setTitled) return
    setTitled(true)
    return () => setTitled(false)
  }, [setTitled])

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between gap-sm border-b border-border p-md',
        className
      )}
    >
      <h2 id={ctx?.titleId} className="text-h5 text-foreground">
        {title}
      </h2>
      <div className="flex items-center gap-xs">
        {actions}
        {ctx && (
          <Button variant="tertiary" size="iconInline" aria-label={closeLabel} onClick={ctx.close}>
            <X aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}

export type DrawerBodyProps = {
  children: ReactNode
  className?: string
}

export function DrawerBody({ children, className }: DrawerBodyProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-xs overflow-y-auto p-md', className)}>
      {children}
    </div>
  )
}

export type DrawerFooterProps = {
  children: ReactNode
  className?: string
}

export function DrawerFooter({ children, className }: DrawerFooterProps) {
  return (
    <div
      className={cn(
        'mt-auto flex shrink-0 flex-col-reverse items-stretch gap-xs border-t border-border p-md sm:flex-row sm:items-center sm:justify-end',
        className
      )}
    >
      {children}
    </div>
  )
}
