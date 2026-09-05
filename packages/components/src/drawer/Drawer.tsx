'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '../cn';
import { useFocusTrap } from '../hooks/useFocusTrap';

type DrawerAnchor = 'left' | 'right' | 'bottom';
type DrawerSurface = 'highest' | 'card' | 'none';

export type DrawerProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  children: ReactNode;
  anchor?: DrawerAnchor;
  surface?: DrawerSurface;
  className?: string;
  label?: string;
};

export function Drawer({
  open,
  setOpen,
  children,
  anchor = 'right',
  surface = 'highest',
  className,
  label,
}: DrawerProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  const isBottom = anchor === 'bottom';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
            className="fixed inset-0 z-50 bg-background/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label ? `${label} details` : 'Details'}
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
                    if (info.offset.y > 80 || info.velocity.y > 500) setOpen(false);
                  }
                : undefined
            }
            className={cn(
              isBottom
                ? [
                    'fixed inset-x-0 bottom-0 max-h-[85vh]',
                    'rounded-t-xl',
                    'overflow-y-auto',
                    'pb-5 pt-2 px-md',
                    'flex flex-col',
                  ]
                : [
                    'fixed top-23 sm:top-0',
                    'overflow-y-scroll sm:overflow-y-auto',
                    'space-y-md',
                    'pb-30 sm:pb-5',
                    'p-md',
                    'flex flex-col flex-1',
                    'h-full',
                    'w-full sm:w-1/2 md:w-1/2 lg:w-2/5 xl:w-1/4',
                    'max-w-full sm:max-w-1/2 md:max-w-1/2 lg:max-w-2/5 xl:max-w-1/4',
                    anchor === 'right' ? 'right-0' : 'left-0',
                  ],
              'z-[70] will-change-transform',
              '[scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent]',
              surface === 'highest' &&
                cn(
                  'bg-highest border-border',
                  isBottom ? 'border-t' : anchor === 'right' ? 'border-l' : 'border-r'
                ),
              surface === 'card' && 'bg-card',
              className
            )}
          >
            {isBottom && (
              <div className="flex shrink-0 items-center justify-center pb-0.5 pt-1" aria-hidden="true">
                <div className="h-1 w-9 rounded-full bg-border-strong" />
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body as HTMLElement
  );
}
