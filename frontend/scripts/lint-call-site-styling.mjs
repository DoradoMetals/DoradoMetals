import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const TYPE_SIZES =
  /^(text|font)-(xs|sm|base|lg|xl|[2-9]xl|display|h[1-6]|body|small|micro|thin|light|normal|medium|semibold|bold|black|mono|sans|serif)$/
const APPEARANCE = [
  /^bg-/,
  /^border(-|$)/,
  /^rounded(-|$)/,
  /^shadow(-|$)/,
  /^opacity-/,
  /^transition(-|$)/,
  /^ring(-|$)/,
  /^outline-/,
  /^fill-/,
  /^stroke-/,
  /^backdrop-/,
  /^divide-/,
  /^from-/,
  /^via-/,
  /^to-/,
  /^gradient/,
  /^glass/,
  /^on-glass/,
  /^raised-off-page$/,
  /^recessed/,
  /^shine/,
]
const TEXT_LAYOUT =
  /^text-(left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/

function classifies(token) {
  const cleaned = token.replace(/^[`'",]+|[`'",]+$/g, '')
  const bare = cleaned.replace(/^(?:[a-z-]+:)+/, '')
  if (!bare || bare.startsWith('[')) return null
  if (TEXT_LAYOUT.test(bare)) return null
  if (TYPE_SIZES.test(bare)) return 'type'
  if (bare.startsWith('text-')) return 'colour'
  for (const re of APPEARANCE) if (re.test(bare)) return 'appearance'
  return null
}

function classNameExpressions(src) {
  const out = []
  const re = /\bclassName=/g
  let m
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    if (src[i] === '"' || src[i] === "'") {
      const quote = src[i]
      const end = src.indexOf(quote, i + 1)
      if (end === -1) continue
      out.push(src.slice(i + 1, end))
      continue
    }
    if (src[i] !== '{') continue
    let depth = 0
    const start = i
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1
      else if (src[i] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    out.push(src.slice(start + 1, i))
  }
  return out
}

function classTokens(expr) {
  const literals = [...expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? ''
  )
  const source = literals.length ? literals.join(' ') : expr
  return source.split(/\s+/).filter(Boolean)
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'test-results' || e.startsWith('.')) continue
    const p = join(dir, e)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (e.endsWith('.tsx')) out.push(p)
  }
  return out
}

function sharedImports(src) {
  const names = new Set()
  const re =
    /import\s+(?:(\w+)\s*(?:,\s*)?)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]*shared\/ui[^'"]*)['"]/g
  let m
  while ((m = re.exec(src))) {
    if (m[1]) names.add(m[1])
    if (m[2])
      for (const part of m[2].split(',')) {
        const n = part.split(' as ').pop().trim()
        if (n) names.add(n)
      }
  }
  return names
}

function elements(src, names) {
  const found = []
  for (const name of names) {
    const re = new RegExp(`<${name}(\\s[^>]*?)/?>`, 'gs')
    let m
    while ((m = re.exec(src))) {
      const attrs = m[1]
      const line = src.slice(0, m.index).split('\n').length
      const exprs = classNameExpressions(attrs)
      if (!exprs.length) continue
      const blob = exprs.flatMap((e) => classTokens(e)).join(' ')
      found.push({ name, line, blob, hasVariant: /\bvariant\s*=/.test(attrs) })
    }
  }
  return found
}

if (process.argv.includes('--self-test')) {
  const src = `
import { Button } from '@/shared/ui/base/button'
export const X = () => (<>
  <Button variant="secondary" className="raised-off-page bg-primary text-primary-foreground px-10">a</Button>
  <Button className="gap-1 bg-primary hover:bg-primary text-sm sm:text-base">b</Button>
  <Button className="w-full flex items-center gap-2 mt-4">c</Button>
  <Button className="text-center">d</Button>
</>)`
  const names = sharedImports(src)
  if (!names.has('Button')) {
    console.error('SELF-TEST FAILED: import not seen')
    process.exit(1)
  }
  const els = elements(src, names)
  if (els.length !== 4) {
    console.error(`SELF-TEST FAILED: ${els.length} of 4 elements`)
    process.exit(1)
  }
  const verdicts = els.map((e) => e.blob.split(/\s+/).some((t) => classifies(t)))
  const expected = [true, true, false, false]
  if (String(verdicts) !== String(expected)) {
    console.error(`SELF-TEST FAILED: verdicts ${verdicts}, expected ${expected}`)
    console.error('  (layout-only and text-center must NOT flag; 239 alignment classes exist)')
    process.exit(1)
  }
  if (!els[0].hasVariant || els[1].hasVariant) {
    console.error('SELF-TEST FAILED: variant detection wrong')
    process.exit(1)
  }
  const CN_CASES = [
    [`<div className={cn("flex", active && "text-2xl font-bold")} />`, ['text-2xl', 'font-bold']],
    [`<div className={cn(clsx("gap-2", "text-sm"))} />`, ['text-sm']],
    [`<div className={active ? "text-lg" : "text-xs"} />`, ['text-lg', 'text-xs']],
    [`<div className={cn("p-2", { "font-medium": on })} />`, ['font-medium']],
    [`<div className={cn("text-center", "flex w-full")} />`, []],
  ]
  for (const [markup, want] of CN_CASES) {
    const exprs = classNameExpressions(markup)
    if (exprs.length !== 1) {
      console.error(`SELF-TEST FAILED: ${exprs.length} className expression(s) in ${markup}`)
      process.exit(1)
    }
    const got = classTokens(exprs[0])
      .map((t) => t.replace(/^[`'",]+|[`'",]+$/g, ''))
      .filter((t) => {
        const bare = t.replace(/^(?:[a-z-]+:)+/, '')
        return !TEXT_LAYOUT.test(bare) && TYPE_SIZES.test(bare)
      })
    if (String(got) !== String(want)) {
      console.error(`SELF-TEST FAILED: ${markup}\n  saw [${got}], expected [${want}]`)
      console.error('  This is the cn() blind spot reopening - --scatter reported 0 for months.')
      process.exit(1)
    }
  }
  const nested = classNameExpressions(`<div className={cn("a", { "text-sm": x })} data-x="y" />`)
  if (nested.length !== 1 || !nested[0].includes('text-sm')) {
    console.error('SELF-TEST FAILED: nested braces truncated the className expression')
    process.exit(1)
  }

  console.log('self-test ok: sees shared imports, flags appearance and colour,')
  console.log('leaves layout and text-center alone, separates contradicted from over-specified,')
  console.log(`and reads class strings out of ${CN_CASES.length} cn()/clsx()/ternary spellings.`)
  process.exit(0)
}

if (process.argv.includes('--scatter')) {
  const all = walk(ROOT)
    .filter((f) => !f.includes('/scripts/'))
    .filter((f) => !f.includes('/shared/ui/'))
  const perDir = {}
  let sized = 0,
    arbitrary = 0,
    alignment = 0,
    filesWith = 0
  const ARB = /\b(?:sm:|md:|lg:|xl:|hover:|focus:|dark:)*text-\[[^\]]+\]/g
  for (const f of all) {
    const src = readFileSync(f, 'utf8')
    let n = 0
    for (const expr of classNameExpressions(src)) {
      for (const raw of classTokens(expr)) {
        const tok = raw.replace(/^[`'",]+|[`'",]+$/g, '')
        const bare = tok.replace(/^(?:[a-z-]+:)+/, '')
        if (TEXT_LAYOUT.test(bare)) {
          alignment++
          continue
        }
        if (TYPE_SIZES.test(bare)) {
          sized++
          n++
        }
      }
    }
    const arb = src.match(ARB)
    if (arb) {
      arbitrary += arb.length
      n += arb.length
    }
    if (n) {
      filesWith++
      const dir = relative(ROOT, f).split('/').slice(0, 2).join('/')
      perDir[dir] = (perDir[dir] ?? 0) + n
    }
  }
  console.log(`TYPOGRAPHY SCATTER - the target is ZERO, not a threshold.\n`)
  console.log(`  ${sized} type-size/weight utilities`)
  console.log(`  ${arbitrary} arbitrary sizes (text-[...]) - each is a SCALE GAP`)
  console.log(`  across ${filesWith} of ${all.length} .tsx files`)
  console.log(`  (${alignment} alignment classes counted separately - LAYOUT, never in scope)\n`)
  for (const [dir, n] of Object.entries(perDir)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15))
    console.log(`  ${String(n).padStart(5)}  ${dir}`)
  console.log(`\n  Zero here means a heading size changes in ONE line of typography.css.`)
  console.log(
    `  It does NOT mean zero exist: a class held in a variable, an imported\n` +
      `  variant map, or a name assembled from fragments is invisible to this.\n` +
      `  See the blind-spot list above classNameExpressions().`
  )
  process.exit(sized + arbitrary ? 1 : 0)
}

const files = walk(ROOT).filter((f) => !f.includes('/scripts/'))
const contradicted = []
const overSpecified = []
let scanned = 0,
  callSites = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const names = sharedImports(src)
  if (!names.size) continue
  scanned++
  for (const el of elements(src, names)) {
    callSites++
    const bad = el.blob
      .split(/\s+/)
      .map((t) => [t, classifies(t)])
      .filter(([, k]) => k)
    if (!bad.length) continue
    const entry = {
      file: relative(ROOT, file),
      line: el.line,
      component: el.name,
      classes: bad.map(([t]) => t),
      selfCancellingHover: /\b(\w[\w-]*)\b[^"]*\bhover:\1\b/.test(el.blob),
    }
    ;(el.hasVariant ? contradicted : overSpecified).push(entry)
  }
}

if (!scanned) {
  console.error('REFUSING TO REPORT: found no file importing from shared/ui.')
  console.error('A scan that walks nothing looks exactly like a clean codebase.')
  process.exit(1)
}

const total = contradicted.length + overSpecified.length
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ scanned, callSites, contradicted, overSpecified }, null, 2))
  process.exit(total ? 1 : 0)
}

console.log(`${scanned} files import shared/ui; ${callSites} call sites with a className\n`)

if (contradicted.length) {
  console.log(
    `${contradicted.length} CONTRADICTED - a variant prop overridden by appearance classes.`
  )
  console.log(
    `  The variant is decorative here: the call site asks for one look and paints another.`
  )
  console.log(`  Each is either a missing variant or a wrong one.\n`)
  for (const c of contradicted.slice(0, 25))
    console.log(`  ${c.file}:${c.line}  <${c.component}>  ${c.classes.join(' ')}`)
  if (contradicted.length > 25) console.log(`  ... and ${contradicted.length - 25} more`)
  console.log('')
}

if (overSpecified.length) {
  const cancelling = overSpecified.filter((o) => o.selfCancellingHover)
  console.log(`${overSpecified.length} OVER-SPECIFIED - appearance classes with no variant prop.`)
  if (cancelling.length)
    console.log(`  ${cancelling.length} of them CANCEL THEIR OWN HOVER (bg-x hover:bg-x) - nobody`)
  console.log(`  writes that unless the variant's hover state is wrong.\n`)
  for (const o of overSpecified.slice(0, 25))
    console.log(`  ${o.file}:${o.line}  <${o.component}>  ${o.classes.join(' ')}`)
  if (overSpecified.length > 25) console.log(`  ... and ${overSpecified.length - 25} more`)
  console.log('')
}

const byComponent = {}
for (const e of [...contradicted, ...overSpecified])
  byComponent[e.component] = (byComponent[e.component] ?? 0) + 1
const ranked = Object.entries(byComponent).sort((a, b) => b[1] - a[1])
if (ranked.length) {
  console.log('by component - the top of this list is where a variant set is missing:')
  for (const [name, n] of ranked.slice(0, 12)) console.log(`  ${String(n).padStart(4)}  ${name}`)
  console.log('')
}

if (!total) {
  console.log('no appearance overrides on shared-component call sites.')
  process.exit(0)
}
console.log(`${total} call site(s) style what the component should own.`)
console.log('Layout at the call site, appearance in the component - ruling 20 in FOLLOWUPS.md.')
process.exit(1)
