'use client'

import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import * as React from 'react'
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useReducedMotion } from 'framer-motion'
import { X } from '@dorado/icons'
import { cn } from '../cn'
import { Button, type ButtonProps } from '../button/Button'
import { Spinner } from '../spinner/Spinner'
import { useFocusTrap } from '../hooks/useFocusTrap'

export type DrawerDismissal = 'swipe' | 'outside' | 'escape' | 'close'

type DrawerContextValue = {
  titleId: string
  setTitled: (titled: boolean) => void
  close: () => void
  showClose: boolean
  busy: boolean
  scrolled: boolean
  setScrolled: (scrolled: boolean) => void
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

const SHEET_CLOSE_PX = 80
const FLING_PX_PER_MS = 0.5
const FLING_MIN_PX = 24
const DURATION_S = 0.2
const SPRING_BACK = 'transform 200ms ease-out'
const FIELDS = 'input, textarea, select, [contenteditable="true"]'

export type DrawerProps = {
  open: boolean
  setOpen: (open: boolean) => void
  children: ReactNode
  anchor?: DrawerAnchor
  surface?: DrawerSurface
  size?: DrawerSize
  className?: string
  label?: string
  dismissible?: boolean
  showClose?: boolean
  confirmClose?: (reason: DrawerDismissal) => boolean | Promise<boolean>
  busy?: boolean
  'aria-describedby'?: string
}

const supportsInert = () => typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype

function useInertBackground(open: boolean, own: () => (Element | null)[]) {
  const ownRef = useRef(own)
  ownRef.current = own
  useEffect(() => {
    if (!open) return
    const mine = ownRef.current()
    const native = supportsInert()
    const touched: { el: Element; inert: string | null; hidden: string | null }[] = []
    for (const el of Array.from(document.body.children)) {
      if (mine.includes(el) || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      touched.push({ el, inert: el.getAttribute('inert'), hidden: el.getAttribute('aria-hidden') })
      el.setAttribute('inert', '')
      if (!native) el.setAttribute('aria-hidden', 'true')
    }
    return () => {
      for (const { el, inert, hidden } of touched) {
        if (inert === null) el.removeAttribute('inert')
        else el.setAttribute('inert', inert)
        if (!native) {
          if (hidden === null) el.removeAttribute('aria-hidden')
          else el.setAttribute('aria-hidden', hidden)
        }
      }
    }
  }, [open])
}

let locks = 0
let saved: { overflow: string; gutter: string } | null = null

function useScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    if (locks === 0) {
      saved = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter }
      html.style.scrollbarGutter = 'stable'
      html.style.overflow = 'hidden'
    }
    locks += 1
    return () => {
      locks -= 1
      if (locks === 0 && saved) {
        html.style.overflow = saved.overflow
        html.style.scrollbarGutter = saved.gutter
        saved = null
      }
    }
  }, [open])
}

function useKeyboardInset(open: boolean, panel: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.visualViewport) return
    const viewport = window.visualViewport
    const onResize = () => {
      const el = panel.current
      if (!el) return
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      el.style.bottom = inset > 0 ? `${inset}px` : ''
      el.dataset.keyboard = inset > 0 ? 'open' : 'closed'
      const focused = document.activeElement as HTMLElement | null
      if (inset > 0 && focused && el.contains(focused) && focused.matches(FIELDS)) {
        focused.scrollIntoView?.({ block: 'nearest' })
      }
    }
    viewport.addEventListener('resize', onResize)
    viewport.addEventListener('scroll', onResize)
    return () => {
      viewport.removeEventListener('resize', onResize)
      viewport.removeEventListener('scroll', onResize)
    }
  }, [open, panel])
}

type Swipe = { id: number; start: number; travel: number; at: number; speed: number }

export function Drawer({
  open,
  setOpen,
  children,
  anchor = 'right',
  surface = 'card',
  size,
  className,
  label,
  dismissible = true,
  showClose = true,
  confirmClose,
  busy = false,
  'aria-describedby': describedBy,
}: DrawerProps) {
  const shouldReduceMotion = useReducedMotion()
  const titleId = useId()
  const panelRef = useFocusTrap<HTMLDivElement>(open, {
    initialFocus: () => document.getElementById(titleId),
  })
  const scrimRef = useRef<HTMLDivElement | null>(null)
  const isBottom = anchor === 'bottom'
  const [titled, setTitled] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const dismiss = React.useCallback(
    async (reason: DrawerDismissal) => {
      if (busy) return false
      if (!dismissible && reason !== 'close') return false
      if (confirmClose && !(await confirmClose(reason))) return false
      setOpen(false)
      return true
    },
    [busy, dismissible, confirmClose, setOpen]
  )

  useEffect(() => {
    if (!open) setScrolled(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) void dismiss('escape')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  useInertBackground(open, () => [panelRef.current, scrimRef.current])
  useScrollLock(open)
  useKeyboardInset(open, panelRef)

  const swipe = useRef<Swipe | null>(null)
  const slideX = useMotionValue(0)
  const slideY = useMotionValue(0)
  const sign = anchor === 'left' ? -1 : 1
  const coord = (e: { clientX: number; clientY: number }) =>
    (isBottom ? e.clientY : e.clientX) * sign
  const translate = (px: number) =>
    px === 0 ? '' : isBottom ? `translateY(${px}px)` : `translateX(${px * sign}px)`

  const settle = (el: HTMLElement) => {
    el.style.transition = shouldReduceMotion ? '' : SPRING_BACK
    el.style.transform = ''
    slideX.jump(0)
    slideY.jump(0)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dismissible || !panelRef.current || e.button > 0) return
    const panel = panelRef.current
    const target = e.target as Element
    const handle = target.closest?.('[data-drawer-grabber], [data-drawer-header]') != null
    if (!handle && !isBottom) return
    if (!handle && target.closest?.(FIELDS)) return
    if (target.closest?.('button, a') && !target.closest?.('[data-drawer-grabber]')) return
    slideX.stop()
    slideY.stop()
    swipe.current = { id: e.pointerId, start: coord(e), travel: 0, at: e.timeStamp, speed: 0 }
    panel.style.transition = ''
    const move = (ev: PointerEvent) => {
      const active = swipe.current
      if (!active || ev.pointerId !== active.id) return
      const travel = Math.max(0, coord(ev) - active.start)
      const elapsed = Math.max(1, ev.timeStamp - active.at)
      active.speed = (travel - active.travel) / elapsed
      active.travel = travel
      active.at = ev.timeStamp
      slideX.stop()
      slideY.stop()
      if (isBottom) slideY.jump(travel)
      else slideX.jump(travel * sign)
      panel.style.transform = translate(travel)
    }
    const end = (ev: PointerEvent) => {
      const active = swipe.current
      if (!active || ev.pointerId !== active.id) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      swipe.current = null
      const extent = isBottom ? 0 : panel.getBoundingClientRect().width
      const threshold = extent > 0 ? extent / 3 : SHEET_CLOSE_PX
      const fling = active.speed > FLING_PX_PER_MS && active.travel > FLING_MIN_PX
      if (ev.type === 'pointerup' && (active.travel > threshold || fling)) {
        void dismiss('swipe').then((closed) => {
          if (!closed) settle(panel)
        })
        return
      }
      settle(panel)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  if (typeof document === 'undefined') return null

  const duration = shouldReduceMotion ? 0 : DURATION_S

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            ref={scrimRef}
            data-drawer-scrim
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
            className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
            onClick={() => void dismiss('outside')}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            onFocusCapture={panelRef.onFocusCapture}
            onPointerDown={onPointerDown}
            style={isBottom ? { y: slideY } : { x: slideX }}
            onAnimationStart={() => {
              if (!swipe.current) return
              slideX.stop()
              slideY.stop()
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titled ? titleId : undefined}
            aria-label={titled ? undefined : label ? `${label} details` : 'Details'}
            aria-describedby={describedBy}
            initial={isBottom ? { y: '100%' } : { x: anchor === 'right' ? '100%' : '-100%' }}
            animate={isBottom ? { y: 0 } : { x: 0 }}
            exit={isBottom ? { y: '100%' } : { x: anchor === 'right' ? '100%' : '-100%' }}
            transition={{ duration, ease: 'easeInOut' }}
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
                      'overflow-visible',
                      'flex flex-col',
                      SIZE_WIDTH[size],
                      anchor === 'right' ? 'right-0' : 'left-0',
                    ]
                  : [
                      'fixed top-23 bottom-0 sm:top-0',
                      'overflow-visible',
                      'flex flex-col',
                      'w-full sm:w-1/2 md:w-1/2 lg:w-2/5 xl:w-1/4',
                      'max-w-full sm:max-w-1/2 md:max-w-1/2 lg:max-w-2/5 xl:max-w-1/4',
                      anchor === 'right' ? 'right-0' : 'left-0',
                    ],
              'z-[70] will-change-transform',
              '[scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent]',
              surface !== 'none' &&
                cn(
                  surface === 'highest' ? 'bg-highest' : 'bg-card',
                  'border-border',
                  isBottom ? 'border-t' : anchor === 'right' ? 'border-l' : 'border-r'
                ),
              className
            )}
          >
            {dismissible &&
              (isBottom ? (
                <div
                  data-drawer-grabber
                  aria-hidden="true"
                  className="flex h-11 shrink-0 touch-none items-center justify-center"
                >
                  <div className="h-2xs w-9 rounded-full bg-border-strong" />
                </div>
              ) : (
                <div
                  data-drawer-grabber
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute inset-y-0 z-10 flex w-px items-center justify-center',
                    anchor === 'right' ? '-left-px' : '-right-px'
                  )}
                >
                  <div
                    data-drawer-grabber-hit
                    className="pointer-events-auto flex size-11 shrink-0 cursor-grab touch-none items-center justify-center"
                  >
                    <div
                      data-drawer-grabber-bar
                      className="h-9 w-[3px] rounded-full bg-border-strong"
                    />
                  </div>
                </div>
              ))}
            <DrawerContext.Provider
              value={{
                titleId,
                setTitled,
                close: () => void dismiss('close'),
                showClose,
                busy,
                scrolled,
                setScrolled,
              }}
            >
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
      data-drawer-header
      data-scrolled={ctx?.scrolled ? 'true' : undefined}
      className={cn(
        'flex shrink-0 items-center justify-between gap-sm border-b p-md',
        ctx && !ctx.scrolled ? 'border-transparent' : 'border-border',
        className
      )}
    >
      <h2 id={ctx?.titleId} tabIndex={-1} className="text-h5 text-foreground outline-none">
        {title}
      </h2>
      <div className="flex items-center gap-xs">
        {actions}
        {ctx && ctx.showClose && (
          <Button
            variant="tertiary"
            size="iconInline"
            aria-label={closeLabel}
            disabled={ctx.busy}
            onClick={ctx.close}
          >
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
  const ctx = useContext(DrawerContext)
  const setScrolled = ctx?.setScrolled
  return (
    <div
      aria-busy={ctx?.busy || undefined}
      onScroll={(e) => setScrolled?.(e.currentTarget.scrollTop > 0)}
      className={cn('flex min-h-0 flex-1 flex-col gap-xs overflow-y-auto p-md', className)}
    >
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
        'relative mt-auto flex shrink-0 flex-col-reverse items-stretch gap-xs border-t border-border p-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end',
        className
      )}
    >
      {children}
    </div>
  )
}

export type DrawerFooterAlertProps = {
  children: ReactNode
  className?: string
}

export function DrawerFooterAlert({ children, className }: DrawerFooterAlertProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const alert = ref.current?.querySelector<HTMLElement>('[role="alert"]') ?? ref.current
    if (!alert) return
    if (!alert.hasAttribute('tabindex')) alert.setAttribute('tabindex', '-1')
    alert.focus({ preventScroll: true })
  }, [])
  return (
    <div
      ref={ref}
      data-drawer-footer-alert
      className={cn('absolute inset-x-md bottom-full z-10 mb-xs', className)}
    >
      {children}
    </div>
  )
}

export type DrawerPrimaryProps = ButtonProps & { busyLabel?: string }

export function DrawerPrimary({
  children,
  disabled,
  busyLabel = 'Working',
  ...props
}: DrawerPrimaryProps) {
  const busy = useContext(DrawerContext)?.busy ?? false
  return (
    <Button {...props} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy && <Spinner size="sm" label={busyLabel} />}
      {children}
    </Button>
  )
}
