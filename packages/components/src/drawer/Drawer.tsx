'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '../cn';

type DrawerAnchor = 'left' | 'right';
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
            role="dialog"
            aria-modal="true"
            aria-label={label ? `${label} details` : 'Details'}
            initial={{ x: anchor === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: anchor === 'right' ? '100%' : '-100%' }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeInOut' }}
            className={cn(
              'fixed top-23 sm:top-0',
              'overflow-y-scroll sm:overflow-y-auto',
              '[scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent]',
              'space-y-md',
              'pb-30 sm:pb-5',
              'p-md',
              'flex flex-col flex-1',
              'z-[70]',
              'h-full',
              'w-full sm:w-1/2 md:w-1/2 lg:w-2/5 xl:w-1/4',
              'max-w-full sm:max-w-1/2 md:max-w-1/2 lg:max-w-2/5 xl:max-w-1/4',
              'will-change-transform',
              anchor === 'right' ? 'right-0' : 'left-0',
              surface === 'highest' &&
                cn('bg-highest border-border', anchor === 'right' ? 'border-l' : 'border-r'),
              surface === 'card' && 'bg-card',
              className
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body as HTMLElement
  );
}
