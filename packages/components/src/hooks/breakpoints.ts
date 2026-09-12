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

export function resetBreakpointCache(): void {
  cache = null
}

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
