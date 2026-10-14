#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { ROOT, THEME_DIR, toColor, toPx, evalRadius, num } from './lib.mjs'
import * as M from './map.mjs'

const FILE_KEY = '8A73quhBLBqotJlX95jN9j'
const FILE_NAME = 'Themes and Components'
const SNAPSHOT = path.join(ROOT, 'scripts', 'figma', 'snapshot.json')
const THEME = path.join(THEME_DIR, 'theme.css')
const TYPOGRAPHY = path.join(THEME_DIR, 'typography.css')
const ROOT_PX = 16

const TAILWIND_CONTAINERS = {
  '3xs': '16rem',
  '2xs': '18rem',
  xs: '20rem',
  sm: '24rem',
  md: '28rem',
  lg: '32rem',
  xl: '36rem',
  '2xl': '42rem',
  '3xl': '48rem',
  '4xl': '56rem',
  '5xl': '64rem',
  '6xl': '72rem',
  '7xl': '80rem',
}

const args = process.argv.slice(2)
const check = args.includes('--check')
const files = args.filter((a) => !a.startsWith('--'))
if (!files.length) {
  console.error(
    'usage: pull.mjs <capture-part1.json> [capture-part2.json] [--check]\n' +
      '  part1 is the result of scripts/figma/capture.js PART_1 (collections, textStyles, pages)\n' +
      '  part2 is the result of PART_2 (the hygiene sweep); omitted keeps the committed one'
  )
  process.exit(2)
}

const round4 = (n) => (typeof n === 'number' ? Math.round(n * 10000) / 10000 : n)
const rem = (px) => `${round4(px / ROOT_PX)}rem`
const ratio = (lhPx, sizePx) => String(round4(lhPx / sizePx))
const em = (lsPx, sizePx) => `${round4(lsPx / sizePx)}em`

function normalise(capture) {
  const collections = {}
  for (const [name, coll] of Object.entries(capture.collections)) {
    collections[name] = {
      modes: coll.modes,
      variables: coll.variables
        .map((v) => {
          const out = { name: v.name, type: v.type, alias: v.alias ?? null, value: round4(v.value) }
          if (v.opacity !== undefined) out.opacity = round4(v.opacity)
          if (v.modeValues) {
            out.modeValues = Object.fromEntries(
              Object.entries(v.modeValues).map(([m, x]) => [m, round4(x)])
            )
          }
          return out
        })
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
    }
  }
  const textStyles = capture.textStyles
    .map((s) => {
      const ls =
        s.letterSpacing && typeof s.letterSpacing === 'object'
          ? s.letterSpacing.unit === 'PERCENT'
            ? (s.letterSpacing.value / 100) * s.fontSize
            : s.letterSpacing.value
          : s.letterSpacing
      const lh =
        s.lineHeight && typeof s.lineHeight === 'object' ? s.lineHeight.value : s.lineHeight
      return {
        name: s.name,
        family: s.family,
        style: s.style,
        fontSize: round4(s.fontSize),
        lineHeight: round4(lh),
        letterSpacing: round4(ls),
      }
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  return { collections, textStyles, pages: capture.pages }
}

const capture = normalise(JSON.parse(readFileSync(files[0], 'utf8')))
const previous = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null
const hygiene = files[1]
  ? JSON.parse(readFileSync(files[1], 'utf8'))
  : (previous?.hygiene ?? { scanned: 0, totals: {}, perPage: {}, samples: {} })

const byName = (coll) =>
  new Map((capture.collections[coll]?.variables ?? []).map((v) => [v.name, v]))
const scale = byName('Scale')
const colour = byName('Color')
const type = byName('Typography')
const styleByName = new Map(capture.textStyles.map((s) => [s.name, s]))

const canonicalStyle = (step) =>
  Object.entries(M.TEXT_STYLES).find(([, spec]) => spec.step === step && spec.canonical)?.[0]

const unmapped = []
for (const name of scale.keys())
  if (!M.SCALE[name] && !M.SCALE_ALIASES[name]) unmapped.push(`Scale ${name}`)
for (const name of colour.keys())
  if (!M.COLOR[name] && !M.COLOR_ALIASES[name]) unmapped.push(`Color ${name}`)
for (const step of M.TYPE_STEPS) {
  if (!type.has(`size/${step}`))
    unmapped.push(`Typography size/${step} (in TYPE_STEPS, not in Figma)`)
}
for (const name of type.keys()) {
  const [family, step] = name.split('/')
  if (family === 'weight') continue
  if (!M.TYPE_STEPS.includes(step)) unmapped.push(`Typography ${name}`)
}
for (const name of styleByName.keys()) if (!M.TEXT_STYLES[name]) unmapped.push(`text style ${name}`)
if (unmapped.length) {
  console.error('figma:pull cannot continue - these are in Figma and not in map.mjs:')
  for (const u of unmapped) console.error('  ' + u)
  console.error(
    '\nDeclare each one in scripts/figma/map.mjs (COLOR / SCALE / TYPE_STEPS / TEXT_STYLES,\n' +
      'or the matching ALIASES table), then run again. The map is the correspondence;\n' +
      'this generator never invents a CSS name.'
  )
  process.exit(1)
}

const BLOCKS = { theme: 'theme', inline: 'inline', root: 'root', mobile: 'mobile' }

function locate(text) {
  const span = (at) => {
    const open = text.indexOf('{', at)
    let depth = 0
    let i = open
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}' && --depth === 0) break
    }
    return { start: open + 1, end: i }
  }
  const find = (re) => {
    const m = re.exec(text)
    return m ? span(m.index) : null
  }
  const named = (re, must) => {
    for (const m of text.matchAll(re)) {
      const s = span(m.index)
      if (text.slice(s.start, s.end).includes(must)) return s
    }
    return null
  }
  const found = {
    [BLOCKS.theme]: named(/@theme(?!\s+inline)\s*\{/g, '--spacing-'),
    [BLOCKS.inline]: find(/@theme\s+inline\s*\{/),
    [BLOCKS.root]: named(/(?:^|\n):root\s*\{/g, '--background'),
    [BLOCKS.mobile]: find(/@media\s*\(width\s*<\s*[\d.]+rem\s*\)\s*\{/),
  }
  for (const [name, s] of Object.entries(found)) {
    if (s) continue
    console.error(
      `theme.css has no ${name} block this generator recognises - it looks for the plain @theme block carrying --spacing-, the @theme inline block, the :root block carrying --background, and the (width < Nrem) ramp`
    )
    process.exit(1)
  }
  return found
}

let css = readFileSync(THEME, 'utf8')
const changed = []
const added = []

function declRange(block, name) {
  const span = locate(css)[block]
  if (!span) return null
  const body = css.slice(span.start, span.end)
  const re = new RegExp(`(^|\\n)([ \\t]*)(${name})\\s*:\\s*([^;]*);`)
  const m = re.exec(body)
  if (!m) return null
  const at = span.start + m.index + m[1].length
  return { from: at, to: at + m[0].length - m[1].length, indent: m[2], value: m[4].trim() }
}

function setDecl(block, name, value, { family } = {}) {
  const hit = declRange(block, name)
  if (hit) {
    if (hit.value === value) return
    changed.push(`${name}: ${hit.value} -> ${value}`)
    css = css.slice(0, hit.from) + `${hit.indent}${name}: ${value};` + css.slice(hit.to)
    return
  }
  insert(block, [`${name}: ${value};`], family ?? name.replace(/[^-]+$/, ''))
  added.push(`${name}: ${value}`)
}

function insert(block, lines, family) {
  const span = locate(css)[block]
  const body = css.slice(span.start, span.end)
  const re = new RegExp(`[ \\t]*${family}[a-z0-9-]*\\s*:\\s*[^;]*;`, 'g')
  let last = null
  let m
  while ((m = re.exec(body)) !== null) last = m
  const indent = last ? /^[ \t]*/.exec(last[0])[0] : '  '
  const text = lines.map((l) => `${indent}${l}`).join('\n')
  const at = last ? span.start + last.index + last[0].length : span.end - 1
  css = css.slice(0, at) + '\n' + text + css.slice(at)
}

for (const [figmaName, cssName] of Object.entries(M.SCALE)) {
  const v = scale.get(figmaName)
  if (!v) continue
  const want = M.SCALE_PERCENT[figmaName] ? v.value / 100 : v.value
  if (figmaName === 'radius/base') {
    setDecl(BLOCKS.root, cssName, rem(want))
  } else if (figmaName === 'radius/full') {
    setDecl(BLOCKS.root, cssName, `${want}px`)
  } else if (figmaName.startsWith('radius/')) {
    const base = toPx(declRange(BLOCKS.root, '--radius').value)
    const hit = declRange(BLOCKS.inline, cssName)
    const current = hit ? evalRadius(hit.value, base) : null
    if (current !== want) {
      const delta = want - base
      const expr =
        delta === 0
          ? 'var(--radius)'
          : `calc(var(--radius) ${delta < 0 ? '-' : '+'} ${Math.abs(delta)}px)`
      setDecl(BLOCKS.inline, cssName, expr, { family: '--radius-' })
    }
  } else if (figmaName.startsWith('stroke/')) {
    setDecl(BLOCKS.root, cssName, `${want}px`, { family: '--stroke-' })
  } else if (figmaName.startsWith('opacity/')) {
    setDecl(BLOCKS.root, cssName, String(round4(want)), { family: '--opacity-' })
  } else if (figmaName.startsWith('control/')) {
    setDecl(BLOCKS.root, cssName, rem(want), { family: '--control-' })
  } else if (figmaName.startsWith('chart/')) {
    setDecl(BLOCKS.root, cssName, rem(want), { family: '--chart-' })
  } else if (figmaName.startsWith('page/')) {
    setDecl(BLOCKS.root, cssName, rem(want), { family: '--page-' })
  } else if (figmaName.startsWith('breakpoint/')) {
    setDecl(BLOCKS.theme, cssName, rem(want), { family: '--breakpoint-' })
  } else {
    setDecl(BLOCKS.theme, cssName, rem(want), { family: '--spacing-' })
  }
}

const unpinned = []
for (const cssName of Object.values(M.SCALE)) {
  if (!cssName.startsWith('--spacing-')) continue
  const key = cssName.slice('--spacing-'.length)
  const pin = TAILWIND_CONTAINERS[key]
  if (!pin) {
    if (declRange(BLOCKS.theme, `--max-width-${key}`)) unpinned.push(key)
    continue
  }
  setDecl(BLOCKS.theme, `--max-width-${key}`, pin, { family: '--max-width-' })
}
if (unpinned.length) {
  console.error(
    `--spacing-${unpinned.join(', --spacing-')} shadow a Tailwind container name with no pin value known here; add it to TAILWIND_CONTAINERS`
  )
  process.exit(1)
}

function sortFamily(block, family) {
  const span = locate(css)[block]
  const body = css.slice(span.start, span.end)
  const re = new RegExp(`[ \\t]*${family}[a-z0-9-]*\\s*:\\s*[^;]*;`, 'g')
  const hits = [...body.matchAll(re)]
  if (hits.length < 2) return
  const first = hits[0].index
  const last = hits[hits.length - 1].index + hits[hits.length - 1][0].length
  if (/[^\s]/.test(body.slice(first, last).replace(re, ''))) return
  const indent = /^[ \t]*/.exec(hits[0][0])[0]
  const sorted = hits
    .map((h) => h[0].trim())
    .sort(
      (a, b) =>
        toPx(a.split(':')[1].trim().replace(';', '')) -
        toPx(b.split(':')[1].trim().replace(';', ''))
    )
    .map((l) => indent + l)
    .join('\n')
  if (sorted === body.slice(first, last)) return
  css = css.slice(0, span.start + first) + sorted + css.slice(span.start + last)
}
sortFamily(BLOCKS.theme, '--spacing-')
sortFamily(BLOCKS.theme, '--max-width-')
sortFamily(BLOCKS.theme, '--breakpoint-')
sortFamily(BLOCKS.root, '--control-')

for (const [figmaName, cssName] of Object.entries(M.COLOR)) {
  const v = colour.get(figmaName)
  if (!v) continue
  const hit = declRange(BLOCKS.root, cssName)
  const want = { hex: v.value, alpha: v.opacity ?? 1 }
  const have = hit ? toColor(hit.value) : null
  if (have && have.hex === want.hex && Math.abs(have.alpha - want.alpha) < 0.005) continue
  const literal =
    want.alpha === 1
      ? want.hex
      : `${want.hex}${Math.round(want.alpha * 255)
          .toString(16)
          .padStart(2, '0')}`
  setDecl(BLOCKS.root, cssName, literal, { family: '--' })
}

for (const step of M.TYPE_STEPS) {
  const size = type.get(`size/${step}`)
  if (!size) continue
  const lh = type.get(`line-height/${step}`)
  const ls = type.get(`letter-spacing/${step}`)
  const styleName = canonicalStyle(step)
  const weight = styleName ? M.FONT_WEIGHT[styleByName.get(styleName)?.style] : undefined
  const decls = [
    [`--text-${step}`, rem(size.value)],
    [`--text-${step}--line-height`, lh ? ratio(lh.value, size.value) : null],
    [`--text-${step}--letter-spacing`, ls ? em(ls.value, size.value) : null],
    [`--text-${step}--font-weight`, weight ? String(weight) : null],
  ].filter(([, value]) => value !== null)
  if (!declRange(BLOCKS.theme, `--text-${step}`)) {
    const i = M.TYPE_STEPS.indexOf(step)
    const anchor = M.TYPE_STEPS.slice(0, i)
      .reverse()
      .find((s) => declRange(BLOCKS.theme, `--text-${s}--font-weight`))
    const lines = decls.map(([k, v]) => `${k}: ${v};`)
    if (anchor) {
      const hit = declRange(BLOCKS.theme, `--text-${anchor}--font-weight`)
      css =
        css.slice(0, hit.to) +
        '\n\n' +
        lines.map((l) => hit.indent + l).join('\n') +
        css.slice(hit.to)
    } else {
      insert(BLOCKS.theme, ['', ...lines], '--text-')
    }
    added.push(...decls.map(([k, v]) => `${k}: ${v}`))
    continue
  }
  for (const [k, v] of decls) setDecl(BLOCKS.theme, k, v, { family: '--text-' })
}

{
  const span = locate(css)[BLOCKS.mobile]
  const mode = M.TYPE_MODES.mobile
  const groups = []
  for (const step of M.TYPE_STEPS) {
    const size = type.get(`size/${step}`)
    if (!size?.modeValues) continue
    const sizePx = size.modeValues[mode]
    if (sizePx === undefined) continue
    const lines = []
    if (sizePx !== size.modeValues[M.TYPE_MODES.default])
      lines.push(`--text-${step}: ${rem(sizePx)};`)
    const lh = type.get(`line-height/${step}`)
    if (lh?.modeValues) {
      const want = ratio(lh.modeValues[mode], sizePx)
      const base = ratio(lh.modeValues[M.TYPE_MODES.default], size.modeValues[M.TYPE_MODES.default])
      if (want !== base) lines.push(`--text-${step}--line-height: ${want};`)
    }
    const ls = type.get(`letter-spacing/${step}`)
    if (ls?.modeValues) {
      const want = em(ls.modeValues[mode], sizePx)
      const base = em(ls.modeValues[M.TYPE_MODES.default], size.modeValues[M.TYPE_MODES.default])
      if (want !== base) lines.push(`--text-${step}--letter-spacing: ${want};`)
    }
    if (lines.length) groups.push(lines)
  }
  const body = `\n  :root {\n${groups.map((g) => g.map((l) => '    ' + l).join('\n')).join('\n\n')}\n  }\n`
  const before = css.slice(span.start, span.end)
  if (before !== body) {
    changed.push(`the ${mode} ramp block (${groups.length} steps move)`)
    css = css.slice(0, span.start) + body + css.slice(span.end)
  }
  const bp = toPx(declRange(BLOCKS.theme, M.MOBILE_RAMP_BREAKPOINT).value)
  css = css.replace(/@media\s*\(width\s*<\s*[\d.]+rem\s*\)/, `@media (width < ${rem(bp)})`)
}

let typography = readFileSync(TYPOGRAPHY, 'utf8')
{
  const eyebrow = styleByName.get('Eyebrow')
  if (eyebrow) {
    const sizePx = toPx(declRange(BLOCKS.theme, `--text-${M.TEXT_STYLES.Eyebrow.step}`).value)
    const want = em(eyebrow.letterSpacing, sizePx)
    typography = typography.replace(
      /(\.eyebrow\s*\{[^}]*letter-spacing:\s*)(-?[\d.]+em)/,
      (all, head, had) => {
        if (had !== want) changed.push(`.eyebrow letter-spacing: ${had} -> ${want}`)
        return head + want
      }
    )
    const weight = M.FONT_WEIGHT[eyebrow.style]
    typography = typography.replace(
      /(\.eyebrow\s*\{[^}]*font-weight:\s*)(\d+)/,
      (all, head, had) => {
        if (Number(had) !== weight) changed.push(`.eyebrow font-weight: ${had} -> ${weight}`)
        return head + weight
      }
    )
  }
  for (const step of M.TYPE_STEPS) {
    if (!step.startsWith('stat')) continue
    if (new RegExp(`\\.${step}\\s*\\{`).test(typography)) continue
    const anchor = /\n\n(  \.stat \{[\s\S]*?\n  \})/.exec(typography)
    if (!anchor) continue
    const rule = anchor[1]
      .replace(/--text-stat\b/g, `--text-${step}`)
      .replace('.stat {', `.${step} {`)
    typography = typography.replace(anchor[1], anchor[1] + '\n\n' + rule)
    added.push(`.${step} (typography.css)`)
  }
}

const EMAIL_STYLE = path.join(ROOT, 'packages', 'components', 'src', 'email', 'style.ts')
let emailStyle = readFileSync(EMAIL_STYLE, 'utf8')
{
  const eyebrow = styleByName.get('Eyebrow')
  if (eyebrow) {
    const want = `${round4(eyebrow.letterSpacing)}px`
    emailStyle = emailStyle.replace(
      /(export function eyebrowType[\s\S]*?letterSpacing: ')([^']*)(')/,
      (all, head, had, tail) => {
        if (had !== want)
          changed.push(`eyebrowType letterSpacing: ${had} -> ${want} (email/style.ts)`)
        return head + want + tail
      }
    )
  }
}

const snapshot = {
  fileKey: FILE_KEY,
  fileName: FILE_NAME,
  capturedAt: new Date().toISOString().slice(0, 10),
  collections: capture.collections,
  textStyles: capture.textStyles,
  pages: capture.pages,
  hygiene,
}

function countDiff() {
  if (!previous) return null
  let a = 0
  let c = 0
  let r = 0
  const walk = (oldList, newList, key) => {
    const o = new Map(oldList.map((x) => [x[key], x]))
    const n = new Map(newList.map((x) => [x[key], x]))
    for (const k of n.keys()) if (!o.has(k)) a++
    for (const k of o.keys()) if (!n.has(k)) r++
    for (const [k, v] of n) if (o.has(k) && JSON.stringify(o.get(k)) !== JSON.stringify(v)) c++
  }
  for (const name of new Set([
    ...Object.keys(previous.collections),
    ...Object.keys(capture.collections),
  ]))
    walk(
      previous.collections[name]?.variables ?? [],
      capture.collections[name]?.variables ?? [],
      'name'
    )
  walk(previous.textStyles, capture.textStyles, 'name')
  return { a, c, r }
}
const diff = countDiff()

if (check) {
  const dirty =
    readFileSync(THEME, 'utf8') !== css ||
    readFileSync(TYPOGRAPHY, 'utf8') !== typography ||
    readFileSync(EMAIL_STYLE, 'utf8') !== emailStyle ||
    (existsSync(SNAPSHOT) &&
      readFileSync(SNAPSHOT, 'utf8') !== JSON.stringify(snapshot, null, 2) + '\n')
  console.log(
    dirty
      ? 'figma:pull --check: the capture and the committed files differ'
      : 'figma:pull --check: clean'
  )
  process.exit(dirty ? 1 : 0)
}

writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n')
writeFileSync(THEME, css)
writeFileSync(TYPOGRAPHY, typography)
writeFileSync(EMAIL_STYLE, emailStyle)

if (diff) console.log(`snapshot: ${diff.a} added, ${diff.c} changed, ${diff.r} removed`)
console.log(`css: ${added.length} declaration(s) added, ${changed.length} changed`)
for (const a of added) console.log('  + ' + a)
for (const c of changed) console.log('  ~ ' + c)
