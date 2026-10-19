import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { color } from '@dorado/theme/tokens'

const require = createRequire(import.meta.url)
const BASE_CSS = readFileSync(require.resolve('@dorado/theme/base.css'), 'utf8')

function channels(hex: string): number[] {
  const x = hex.replace('#', '')
  return [0, 2, 4, 6].map((i) => (x.length > i ? parseInt(x.slice(i, i + 2), 16) : 255))
}

function over(fg: string, bg: string): string {
  const f = channels(fg)
  const b = channels(bg)
  const a = f[3] / 255
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(f[i] * a + b[i] * (1 - a))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex)
    .slice(0, 3)
    .map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

type Pair = { fg: string; bg: string; over?: string; min: 3 | 4.5 }

const SURFACES = ['background', 'card', 'popover', 'highest', 'muted', 'secondary']

const PAIRS: Pair[] = [
  ...[
    'foreground',
    'subtle',
    'muted-foreground',
    'placeholder',
    'success',
    'destructive',
    'warning',
    'info',
    'brand',
  ].flatMap((fg) => SURFACES.map((bg) => ({ fg, bg, min: 4.5 as const }))),
  { fg: 'primary-foreground', bg: 'primary', min: 4.5 },
  { fg: 'destructive-foreground', bg: 'destructive', min: 4.5 },
  { fg: 'success-foreground', bg: 'success', min: 4.5 },
  { fg: 'warning-foreground', bg: 'warning', min: 4.5 },
  { fg: 'info-foreground', bg: 'info', min: 4.5 },
  ...['success', 'destructive', 'warning', 'info'].flatMap((hue) => [
    { fg: hue, bg: `${hue}-muted`, min: 4.5 as const },
    { fg: hue, bg: `${hue}-soft`, over: 'card', min: 4.5 as const },
    { fg: hue, bg: `${hue}-soft`, over: 'background', min: 4.5 as const },
  ]),
  { fg: 'foreground', bg: 'surface-soft', over: 'card', min: 4.5 },
  { fg: 'muted-foreground', bg: 'surface-soft', over: 'card', min: 4.5 },
  ...['ring', 'primary', 'border', 'border-strong', 'input'].flatMap((fg) =>
    ['background', 'card', 'popover', 'highest'].map((bg) => ({ fg, bg, min: 3 as const }))
  ),
]

const name = (p: Pair) => `${p.fg} on ${p.bg}${p.over ? ` over ${p.over}` : ''}`

const KNOWN_SHORT = [
  'placeholder on popover',
  'placeholder on highest',
  'placeholder on muted',
  'placeholder on secondary',
  'destructive on secondary',
  'destructive-foreground on destructive',
  'destructive on destructive-soft over card',
  'border on background',
  'border on card',
  'border on popover',
  'border on highest',
  'border-strong on background',
  'border-strong on card',
  'border-strong on popover',
  'border-strong on highest',
  'input on background',
  'input on card',
  'input on popover',
  'input on highest',
]

function ratioOf(p: Pair): number {
  const bg = p.over ? over(color(p.bg), color(p.over)) : color(p.bg)
  return contrast(color(p.fg), bg)
}

describe('theme contrast', () => {
  it('every text pair reaches 4.5:1 and every UI pair 3:1, except the pairs listed for Jacob', () => {
    const short = PAIRS.filter((p) => ratioOf(p) < p.min).map(name)
    expect(short).toEqual(KNOWN_SHORT)
  })

  it('the focus ring reaches 3:1 on every surface it can sit on', () => {
    for (const bg of ['background', 'card', 'popover', 'highest', 'muted', 'secondary']) {
      expect(ratioOf({ fg: 'ring', bg, min: 3 })).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('theme focus, hit area and motion', () => {
  it('focus-ring is one utility: a --ring outline on :focus-visible, never removed', () => {
    const block = /@utility focus-ring\s*\{([\s\S]*?)\n\}/.exec(BASE_CSS)?.[1] ?? ''
    expect(block).toContain('&:focus-visible')
    expect(block).toMatch(/outline:\s*var\(--stroke-heavy\) solid var\(--ring\)/)
    expect(block).not.toMatch(/outline:\s*(none|0)/)
  })

  it('hit-area grows the touch target to 44px on coarse pointers without changing the box', () => {
    const block = /@utility hit-area\s*\{([\s\S]*?)\n\}/.exec(BASE_CSS)?.[1] ?? ''
    expect(block).toContain('@media (pointer: coarse)')
    expect(block).toContain('&::after')
    expect(block).toContain('2.75rem')
    expect(block).not.toMatch(/(^|\s)(padding|margin|width|height):[^;]*;\s*\n\s*@media/)
  })

  it('prefers-reduced-motion stops animations and transitions everywhere', () => {
    const block =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(BASE_CSS)?.[1] ?? ''
    expect(block).toMatch(/animation-duration:\s*0\.01ms !important/)
    expect(block).toMatch(/animation-iteration-count:\s*1 !important/)
    expect(block).toMatch(/transition-duration:\s*0\.01ms !important/)
    expect(block).toMatch(/scroll-behavior:\s*auto !important/)
  })
})
