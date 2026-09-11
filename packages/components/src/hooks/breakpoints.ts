// The breakpoint scale. packages/theme/theme.css is the source of truth and
// Figma's Scale collection carries all six as breakpoint/* since 2026-09-11,
// so figma:tokens checks the theme against the library and
// frontend/shared/tests/theme-breakpoints.test.ts checks this file against the
// theme.
//
// These numbers are the FALLBACK, not the answer: breakpointPx() reads
// --breakpoint-* off the root element at runtime, so the hook and the
// stylesheet cannot disagree even for a build where one of them moved. They
// stay declared here because a hook has to answer during server rendering,
// where there is no document to read.
export const BREAKPOINTS = {
  xs: 304,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

export const BREAKPOINT_ORDER = [
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
] as const satisfies readonly Breakpoint[]

// rem in a media query is resolved against the INITIAL font size, never the
// root element's own - which is what Tailwind compiles its own `md:` queries
// against, so this has to be the constant 16 rather than a measurement.
const ROOT_PX = 16

function parsePx(value: string): number | null {
  const v = value.trim()
  const rem = /^(-?[\d.]+)rem$/.exec(v)
  if (rem) return Number(rem[1]) * ROOT_PX
  const px = /^(-?[\d.]+)px$/.exec(v)
  if (px) return Number(px[1])
  const bare = /^(-?[\d.]+)$/.exec(v)
  if (bare) return Number(bare[1])
  return null
}

let cache: Record<Breakpoint, number> | null = null

/** Test seam. The cache is per document, and jsdom gets a fresh one per file. */
export function resetBreakpointCache(): void {
  cache = null
}

/**
 * The px threshold for a step, read from the theme's own custom property.
 *
 * Falls back to BREAKPOINTS per step, and does NOT cache a read where the
 * stylesheet resolved nothing at all - otherwise a call made before the theme
 * is applied would pin the fallbacks for the life of the page.
 */
export function breakpointPx(bp: Breakpoint): number {
  if (cache) return cache[bp]
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function')
    return BREAKPOINTS[bp]

  const style = getComputedStyle(document.documentElement)
  const read = {} as Record<Breakpoint, number>
  let resolved = 0
  for (const name of BREAKPOINT_ORDER) {
    const px = parsePx(style.getPropertyValue(`--breakpoint-${name}`) ?? '')
    if (px !== null) resolved++
    read[name] = px ?? BREAKPOINTS[name]
  }
  if (resolved === 0) return BREAKPOINTS[bp]
  cache = read
  return cache[bp]
}
