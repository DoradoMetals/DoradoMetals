// Mirrors the --breakpoint-* scale in packages/theme/theme.css, which is the
// source of truth. breakpoints.test.ts parses that file and fails on drift.
// Figma's Scale collection carries only breakpoint/xs (304); the rest are
// listed in docs/waves/app-shell.md for Jacob to add.
export const BREAKPOINTS = {
  xs: 304,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

export const BREAKPOINT_ORDER = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const satisfies readonly Breakpoint[]
