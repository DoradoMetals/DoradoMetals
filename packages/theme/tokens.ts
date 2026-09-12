// The tokens, read from theme.css. There is no second copy of a value here.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export const THEME_CSS = readFileSync(join(HERE, 'theme.css'), 'utf8')

const ROOT_FONT_PX = 16

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function declarationBlocks(css: string, opts: { inline?: boolean } = {}): string[] {
  const out: string[] = []
  const source = stripComments(css)
  const opener =
    opts.inline === false
      ? /(?:^|[};])\s*(?::root|@theme(?!\s+inline))\s*\{/g
      : /(?:^|[};])\s*(?::root|@theme(?:\s+inline)?)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = opener.exec(source)) !== null) {
    let depth = 1
    let i = opener.lastIndex
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}') depth -= 1
      i += 1
    }
    out.push(source.slice(opener.lastIndex, i - 1))
  }
  return out
}

function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const block of declarationBlocks(css, { inline: true })) {
    // Skip nested at-rules (@keyframes inside @theme) by cutting them out.
    const flat = block.replace(/@[\w-]+[^{]*\{[\s\S]*?\}\s*\}/g, '')
    const decl = /(--[\w-]+)\s*:\s*([^;{}]+);/g
    let match: RegExpExecArray | null
    while ((match = decl.exec(flat)) !== null) found.set(match[1], match[2].trim())
  }
  return found
}

const RAW = declarations(THEME_CSS)

function hex(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0')
}

function hslToHex(value: string): string | null {
  const match =
    /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i.exec(
      value
    )
  if (!match) return null
  const h = Number(match[1]) / 360
  const s = Number(match[2]) / 100
  const l = Number(match[3]) / 100
  const channel = (t: number): number => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const rgb = s === 0 ? [l, l, l] : [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
  const alpha = match[4] === undefined ? '' : hex(Number(match[4]) * 255)
  return `#${rgb.map((c) => hex(c * 255)).join('')}${alpha}`
}

function evaluate(value: string, seen: Set<string>): string {
  let out = value.trim()

  const varRef = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/
  let ref: RegExpExecArray | null
  while ((ref = varRef.exec(out)) !== null) {
    const name = ref[1]
    const declared = seen.has(name) ? undefined : RAW.get(name)
    const replacement =
      declared === undefined ? (ref[2] ?? '').trim() : evaluate(declared, new Set([...seen, name]))
    out = out.slice(0, ref.index) + replacement + out.slice(ref.index + ref[0].length)
  }

  const calc = /^calc\(\s*(-?[\d.]+)(px|rem)?\s*([+-])\s*(-?[\d.]+)(px|rem)?\s*\)$/.exec(out)
  if (calc) {
    const left = calc[2] === 'rem' ? Number(calc[1]) * ROOT_FONT_PX : Number(calc[1])
    const right = calc[5] === 'rem' ? Number(calc[4]) * ROOT_FONT_PX : Number(calc[4])
    return `${calc[3] === '+' ? left + right : left - right}px`
  }

  const asHex = hslToHex(out)
  return asHex ?? out
}

/** Every token theme.css declares, with `var()`, `calc()` and `hsl()` resolved. */
export const tokens: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    [...RAW.keys()].map((name) => [name, evaluate(RAW.get(name) as string, new Set([name]))])
  )
)

function read(name: string): string {
  const value = tokens[name]
  if (value === undefined) throw new Error(`theme.css declares no ${name}`)
  return value
}

/** A colour as a hex string. Mail clients resolve no custom property. */
export function color(name: string): string {
  return read(name.startsWith('--') ? name : `--${name}`)
}

/** A length in px, whatever unit theme.css declares it in. */
export function px(name: string): string {
  const value = read(name.startsWith('--') ? name : `--${name}`)
  const rem = /^(-?[\d.]+)rem$/.exec(value)
  if (rem) return `${Number(rem[1]) * ROOT_FONT_PX}px`
  return value
}

function pxNumber(value: string): number {
  return Number(/^(-?[\d.]+)/.exec(value)?.[1] ?? '0')
}

export type TypeStep = {
  size: string
  lineHeight: string
  letterSpacing: string
  weight: string
}

/** One step of the ramp, every part in px so an inline style can carry it. */
export function text(step: string): TypeStep {
  const size = px(`--text-${step}`)
  const size_ = pxNumber(size)
  const rawLine = read(`--text-${step}--line-height`)
  const rawTracking = read(`--text-${step}--letter-spacing`)
  const em = /^(-?[\d.]+)em$/.exec(rawTracking)
  return {
    size,
    lineHeight: /^[\d.]+$/.test(rawLine)
      ? `${round(Number(rawLine) * size_)}px`
      : px(`--text-${step}--line-height`),
    letterSpacing: em ? `${round(Number(em[1]) * size_)}px` : rawTracking,
    weight: read(`--text-${step}--font-weight`),
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

export const space = {
  '3xs': px('--spacing-3xs'),
  '2xs': px('--spacing-2xs'),
  xs: px('--spacing-xs'),
  sm: px('--spacing-sm'),
  md: px('--spacing-md'),
  lg: px('--spacing-lg'),
  xl: px('--spacing-xl'),
  '2xl': px('--spacing-2xl'),
  '3xl': px('--spacing-3xl'),
} as const

export const radius = px('--radius')

export const stroke = {
  hairline: px('--stroke-hairline'),
  emphasis: px('--stroke-emphasis'),
  heavy: px('--stroke-heavy'),
} as const

function unquoted(stack: string): string {
  return stack.replace(/['"]/g, '').replace(/\s+/g, ' ').trim()
}

export const fontStack = unquoted(
  'Geist, Geist Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif'
)

export const monoStack = unquoted(`Geist Mono, ${read('--font-mono').replace(/^[\s,]+/, '')}`)

export function themeCss(): string {
  const source = stripComments(THEME_CSS)
  const blocks = declarationBlocks(THEME_CSS, { inline: false })
    .map((block) => block.replace(/@[\w-]+[^{]*\{[\s\S]*?\}\s*\}/g, ''))
    .map((block) => `:root {${block}}`)
  const mobile = /@media\s*\(width\s*<[^)]*\)\s*\{[\s\S]*?\n\}/.exec(source)
  return [...blocks, mobile ? mobile[0] : ''].filter(Boolean).join('\n')
}
