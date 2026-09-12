'use client'

import * as React from 'react'

import {
  BREAKPOINTS,
  BREAKPOINT_ORDER,
  breakpointPx,
  resetBreakpointCache,
  type Breakpoint,
} from './breakpoints'

const query = (bp: Breakpoint) => `(min-width: ${breakpointPx(bp)}px)`

const noopSubscribe = () => () => {}

export function useMediaUp(bp: Breakpoint): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query(bp))
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [bp]
  )
  const getSnapshot = React.useCallback(() => window.matchMedia(query(bp)).matches, [bp])
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export function useMounted(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )
}

export type BreakpointState = {
  breakpoint: Breakpoint
  mounted: boolean
  isAbove: (bp: Breakpoint) => boolean
  isBelow: (bp: Breakpoint) => boolean
}

export function useBreakpoint(): BreakpointState {
  const matches: Record<Breakpoint, boolean> = {
    xs: useMediaUp('xs'),
    sm: useMediaUp('sm'),
    md: useMediaUp('md'),
    lg: useMediaUp('lg'),
    xl: useMediaUp('xl'),
    '2xl': useMediaUp('2xl'),
  }
  const mounted = useMounted()

  let breakpoint: Breakpoint = 'xs'
  for (const bp of BREAKPOINT_ORDER) if (matches[bp]) breakpoint = bp

  return {
    breakpoint,
    mounted,
    isAbove: (bp) => matches[bp],
    isBelow: (bp) => !matches[bp],
  }
}

export { BREAKPOINTS, BREAKPOINT_ORDER, breakpointPx, resetBreakpointCache, type Breakpoint }
