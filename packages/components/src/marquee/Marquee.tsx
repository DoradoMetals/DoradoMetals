'use client'

import * as React from 'react'

import { cn } from '../cn'

export type MarqueeProps = {
  children: React.ReactNode
  layout?: 'desktop' | 'mobile'
  duration?: number
  label?: string
  leading?: React.ReactNode
  showBorders?: boolean
  className?: string
}

const TRACK = 'flex shrink-0 items-center gap-xl pr-xl'
const MOVING =
  'motion-safe:animate-marquee group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]'

export function Marquee({
  children,
  layout = 'mobile',
  duration = 30,
  label,
  leading,
  showBorders = true,
  className,
}: MarqueeProps) {
  if (layout === 'desktop') {
    return (
      <section
        aria-label={label}
        data-layout="desktop"
        className={cn(
          'h-(--control-lg) w-full bg-card',
          showBorders && 'border-y border-border',
          className
        )}
      >
        <div className="mx-auto flex h-full w-full max-w-page items-center gap-xl overflow-hidden px-lg py-sm">
          {leading}
          <div className="ml-auto flex items-center gap-xl">{children}</div>
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label={label}
      data-layout="mobile"
      className={cn(
        'group flex h-(--control-lg) w-full items-center overflow-x-auto bg-card px-lg',
        showBorders && 'border-y border-border',
        'motion-safe:overflow-hidden',
        className
      )}
    >
      <div className={cn(TRACK, MOVING)} style={{ animationDuration: `${duration}s` }}>
        {children}
      </div>
      <div
        aria-hidden
        className={cn(TRACK, 'hidden motion-safe:flex', MOVING)}
        style={{ animationDuration: `${duration}s` }}
      >
        {children}
      </div>
    </section>
  )
}
