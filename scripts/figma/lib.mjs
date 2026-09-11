// Shared helpers for the Figma sync checks: read the CSS the app actually
// ships, and normalise both sides onto one unit so they can be compared.
//
// The two sides do NOT speak the same units, and that is the whole reason
// this file exists:
//   - Figma stores colour as 0..1 RGB (captured here as hex), sizes in PX,
//     line-height in PX, letter-spacing in PX.
//   - theme.css stores colour mostly as hsl() (with four muted values as raw
//     hex), sizes in rem, line-height as a UNITLESS RATIO, letter-spacing in
//     em, and three radii as calc() off a --radius base.
// Everything is converted to hex / px here so a diff means a real difference
// and not a unit mismatch.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const THEME_DIR = path.join(ROOT, 'packages', 'theme')

export const readSnapshot = () =>
  JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'figma', 'snapshot.json'), 'utf8'))

/** hsl(228, 13%, 4%) -> "#09090c". Rounds the same way Figma does. */
export function hslToHex(h, s, l) {
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const seg = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg]
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

/**
 * Accepts `hsl(h, s%, l%)`, the space form `hsl(h s% l% / a)`, `#rgb`,
 * `#rrggbb` and `#rrggbbaa`. Returns `{ hex, alpha }` or null.
 *
 * Alpha is a separate field rather than baked into the hex because Figma
 * stores it that way: the soft status tokens are the SAME rgb as their solid
 * sibling, and only the alpha distinguishes them. Comparing hex alone would
 * report four duplicate colours and never notice a 16% that drifted to 20%.
 */
export function toColor(value) {
  const v = String(value).trim()
  const hsl =
    /^hsl\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(
      v
    )
  if (hsl) {
    const raw = hsl[4]
    const alpha =
      raw === undefined ? 1 : raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw)
    return { hex: hslToHex(Number(hsl[1]), Number(hsl[2]), Number(hsl[3])), alpha }
  }
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v)
  if (short)
    return {
      hex: ('#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toLowerCase(),
      alpha: 1,
    }
  const long = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v)
  if (long)
    return {
      hex: ('#' + long[1]).toLowerCase(),
      alpha: long[2] === undefined ? 1 : parseInt(long[2], 16) / 255,
    }
  return null // not a literal colour - a var() reference, a gradient, something else
}

/** The rgb half only, for callers that do not care about alpha. */
export function toHex(value) {
  const c = toColor(value)
  return c === null ? null : c.hex
}

/** "0.5rem" -> 8, "16px" -> 16, "1.05" -> 1.05. Root font size is 16. */
export function toPx(value, rootPx = 16) {
  const v = String(value).trim()
  let m = /^(-?[\d.]+)rem$/.exec(v)
  if (m) return Number(m[1]) * rootPx
  m = /^(-?[\d.]+)px$/.exec(v)
  if (m) return Number(m[1])
  m = /^(-?[\d.]+)$/.exec(v)
  if (m) return Number(m[1])
  return null
}

/**
 * Evaluates the one calc() shape theme.css uses for radii:
 *   calc(var(--radius) - 4px)   calc(var(--radius) + 4px)   var(--radius)
 * Anything else returns null rather than guessing.
 */
export function evalRadius(expr, radiusPx) {
  const v = String(expr).trim()
  if (/^var\(--radius\)$/.test(v)) return radiusPx
  const m = /^calc\(\s*var\(--radius\)\s*([-+])\s*([\d.]+)px\s*\)$/.exec(v)
  if (!m) return toPx(v)
  return m[1] === '-' ? radiusPx - Number(m[2]) : radiusPx + Number(m[2])
}

/** Pulls `--name: value;` declarations out of a block of CSS text. */
function declarations(text) {
  const out = new Map()
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.set(m[1], m[2].trim())
  }
  return out
}

/**
 * Cuts every `@media` block out of `raw` and returns them separately.
 *
 * THIS IS NOT TIDINESS. `declarations()` is a flat scan, so a later
 * declaration overwrites an earlier one - which means the Mobile ramp block,
 * sitting between @theme and :root in theme.css, would be read AS the theme.
 * It was harmless only while every value in it repeated the Default; the
 * moment `--text-h1` became 2rem below md, every Default-mode check would have
 * compared Figma's 36px against the MOBILE 32px and reported the ramp broken.
 */
function splitMedia(raw) {
  const blocks = []
  let base = ''
  let i = 0
  while (i < raw.length) {
    const at = raw.indexOf('@media', i)
    if (at === -1) {
      base += raw.slice(i)
      break
    }
    const open = raw.indexOf('{', at)
    if (open === -1) {
      base += raw.slice(i)
      break
    }
    let depth = 0
    let end = open
    for (; end < raw.length; end++) {
      if (raw[end] === '{') depth++
      else if (raw[end] === '}' && --depth === 0) break
    }
    base += raw.slice(i, at)
    blocks.push({
      condition: raw.slice(at + 6, open).trim(),
      body: raw.slice(open + 1, end),
    })
    i = end + 1
  }
  return { base, blocks }
}

/**
 * Pulls `--name: value;` declarations out of a CSS file. Comments are stripped
 * first so a commented-out token is not read as live - theme.css carries long
 * rationale comments between declarations, and several of them contain values.
 * Declarations inside a `@media` block are NOT included; see splitMedia.
 */
export function readCssVars(file) {
  const raw = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return declarations(splitMedia(raw).base)
}

/**
 * theme.css, read as two layers: the base ramp, and the narrow-width block
 * that redefines part of it. `mobile` is the `@media (width < Xrem)` block -
 * the code half of the Figma Typography collection's Mobile mode - carrying
 * only the properties it actually overrides, plus the width it switches at.
 * Null when there is no such block; `extraMedia` counts any OTHER @media
 * block, because a second one redefining the ramp would be read by nothing.
 */
export function loadTheme() {
  const raw = readFileSync(path.join(THEME_DIR, 'theme.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  )
  const { base, blocks } = splitMedia(raw)
  const vars = declarations(base)
  const radiusPx = toPx(vars.get('--radius') ?? '0.5rem')

  const narrow = blocks.filter((b) => /^\(\s*width\s*<\s*[\d.]+rem\s*\)$/.test(b.condition))
  const mobile = narrow.length
    ? {
        condition: narrow[0].condition,
        widthPx: toPx(/([\d.]+rem)/.exec(narrow[0].condition)[1]),
        vars: declarations(narrow[0].body),
      }
    : null

  return {
    vars,
    radiusPx,
    mobile,
    extraMedia: blocks.length - narrow.length,
    narrowCount: narrow.length,
  }
}

/** Formats a number for a report without trailing float noise. */
export const num = (n) => (Math.round(n * 1000) / 1000).toString()

export function report(title, findings, { notes = [] } = {}) {
  console.log(title)
  for (const n of notes) console.log('  ' + n)
  if (!findings.length) {
    console.log('  clean\n')
    return 0
  }
  for (const f of findings) console.log('  ' + f)
  console.log(`  ${findings.length} finding${findings.length === 1 ? '' : 's'}\n`)
  return findings.length
}
