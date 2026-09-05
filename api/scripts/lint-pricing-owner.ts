import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { domainDirs, isTransportFile } from './lib/layout.ts'

const ROOT = process.env.LINT_PRICING_OWNER_ROOT
  ? path.resolve(process.env.LINT_PRICING_OWNER_ROOT)
  : path.join(import.meta.dirname, '..')

const OWNER = 'pricing'
const PUBLIC_ENTRY = '#pricing/index.ts'

const MONEY = ['price', 'premium', 'content', 'spot', 'ask', 'bid', 'fee', 'tax']

const SCANNED = ['db', 'shared', 'providers', 'scripts', ...domainDirs(ROOT)]

const ACCEPTED: Record<string, { count: number; why: string }> = {}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'tests' || entry === 'sql') {
      continue
    }
    const full = path.join(dir, entry)
    let stats
    try {
      stats = statSync(full)
    } catch {
      continue
    }
    if (stats.isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
      out.push(full)
    }
  }
  return out
}

function withoutCommentsOrStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, lead: string) => lead)
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => m.replace(/[^\n]/g, ' '))
}

const words = (segment: string): string[] =>
  segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())

function isMoney(reference: string): boolean {
  const segment = reference.split(/[.?!]/).filter(Boolean).pop() ?? reference
  return words(segment).some(
    (word) => MONEY.includes(word) || (word.endsWith('s') && MONEY.includes(word.slice(0, -1)))
  )
}

const REFERENCE = '[A-Za-z_$][A-Za-z0-9_$]*(?:\\??\\.[A-Za-z_$][A-Za-z0-9_$]*)*'
const PRODUCT = new RegExp(`(${REFERENCE})?\\s*\\*(?!\\*)\\s*(${REFERENCE})?`, 'g')
const INSIDE = `#${OWNER}/`
const IMPORT = new RegExp(
  `^\\s*(?:import|export)\\b[^\\n;]*?from\\s+["'](${INSIDE}[^"']+)["']` +
    `|\\bimport\\(\\s*["'](${INSIDE}[^"']+)["']\\s*\\)`,
  'gm'
)

const lineOf = (src: string, index: number): number => src.slice(0, index).split('\n').length

type Finding = { line: number; what: string }

function findingsIn(raw: string): Finding[] {
  const src = withoutCommentsOrStrings(raw)
  const found: Finding[] = []

  for (const match of src.matchAll(PRODUCT)) {
    for (const reference of [match[1], match[2]]) {
      if (!reference || !isMoney(reference)) continue
      found.push({
        line: lineOf(src, match.index ?? 0),
        what: `multiplies \`${reference}\` - money arithmetic belongs to ${OWNER}`,
      })
    }
  }

  for (const match of raw.matchAll(IMPORT)) {
    const target = match[1] ?? match[2]
    if (!target || target === PUBLIC_ENTRY) continue
    const inner = target.slice(INSIDE.length)
    if (inner.includes('/') || isTransportFile(inner)) continue
    found.push({
      line: lineOf(raw, match.index ?? 0),
      what: `imports \`${target}\` - the only way in is ${PUBLIC_ENTRY}`,
    })
  }

  return found.sort((a, b) => a.line - b.line)
}

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const LOW = { LINT_PRICING_OWNER_FLOOR: '1' }
  const manifest = {
    'package.json': JSON.stringify({
      imports: Object.fromEntries(
        ['checkout', 'logistics', 'orders', 'payments', 'pricing'].map((d) => [
          `#${d}/*`,
          `./${d}/*`,
        ])
      ),
    }),
  }

  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: 'a service multiplying a price is a finding',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: { ...manifest, 'orders/service.ts': 'const total = unit_price * quantity;\n' },
        expect: 'fail',
        mustPrint: 'unit_price',
      },
      {
        name: 'the spot on the right-hand side is seen too',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: { ...manifest, 'checkout/service.ts': 'const v = content * (spot.bid ?? 0);\n' },
        expect: 'fail',
        mustPrint: 'checkout/service.ts',
      },
      {
        name: 'a camelCase money name counts',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: { ...manifest, 'payments/service.ts': 'const c = subjectTo * cardFee;\n' },
        expect: 'fail',
        mustPrint: 'cardFee',
      },
      {
        name: 'reaching past the public index is a finding',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'orders/place.ts': 'import { priceOrder } from "#pricing/service.ts";\n',
        },
        expect: 'fail',
        mustPrint: 'the only way in',
      },
      {
        name: 'the pricing domain may do its own arithmetic',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'pricing/rules.ts': 'const v = content * (spot.bid * premium);\n',
          'orders/service.ts': 'const n = rows.length;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'the public index is the allowed import',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'orders/service.ts': 'import * as pricing from "#pricing/index.ts";\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a multiplication of things that are not money is fine',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: { ...manifest, 'logistics/shipping/rules.ts': 'const area = width * height;\n' },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a money word inside a comment is not a finding',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'orders/service.ts': '// unit_price * quantity used to live here\nconst n = 1;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a money word inside a string is not a finding',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: { ...manifest, 'orders/rules.ts': 'const m = "price * quantity";\n' },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a namespace import of a pricing sub-resource is not a multiplication',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'orders/service.ts': 'import * as tax from "#pricing/sales-tax/service.ts";\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a test file is not a finding',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'orders/service.ts': 'const n = 1;\n',
          'orders/tests/x.test.ts': 'const t = unit_price * quantity;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'an empty tree is broken, not clean',
        rootEnv: 'LINT_PRICING_OWNER_ROOT',
        files: { ...manifest, 'orders/service.ts': 'const n = 1;\n' },
        expect: 'fail',
        mustPrint: 'fewer files',
      },
    ],
  })
}

const SYNTHETIC = Boolean(process.env.LINT_PRICING_OWNER_ROOT)
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/')

let scanned = 0
const byFile = new Map<string, Finding[]>()

for (const dir of SCANNED) {
  for (const file of walk(path.join(ROOT, dir))) {
    const name = rel(file)
    if (name.startsWith(`${OWNER}/`)) continue
    scanned += 1
    const found = findingsIn(readFileSync(file, 'utf8'))
    if (found.length) byFile.set(name, found)
  }
}

const FLOOR = Number(process.env.LINT_PRICING_OWNER_FLOOR ?? 302)
if (scanned < FLOOR) {
  console.error(
    `lint:pricing-owner scanned ${scanned} file(s), fewer files than the api actually ` +
      `holds (at least ${FLOOR}). The walk broke, not the tree shrank.`
  )
  process.exit(1)
}

if (!SYNTHETIC) {
  const control = findingsIn(
    'const unit = content * (spot.bid * premium);\n' +
      ['im', 'port { priceOrder } from ', '"#pricing/service.ts";'].join('') +
      '\n'
  )
  if (control.length !== 4) {
    console.error(
      `lint:pricing-owner's own control sample produced ${control.length} finding(s), ` +
        `not 4. A detector that sees nothing reports a clean tree.`
    )
    process.exit(1)
  }
}

const problems: string[] = []
const acceptedHit = new Set<string>()

for (const [file, found] of [...byFile].sort()) {
  const entry = SYNTHETIC ? undefined : ACCEPTED[file]
  if (!entry) {
    for (const finding of found) problems.push(`${file}:${finding.line}  ${finding.what}`)
    continue
  }
  acceptedHit.add(file)
  if (entry.count !== found.length) {
    problems.push(
      `${file}  ACCEPTED says ${entry.count} finding(s), the file has ${found.length}. ` +
        (found.length < entry.count
          ? `Good - lower the ACCEPTED count to ${found.length} in the same diff.`
          : `New money arithmetic was added to an accepted file.`)
    )
  }
}

console.log(
  `${scanned} file(s) scanned outside ${OWNER} for money arithmetic and for reaching ` +
    `past ${PUBLIC_ENTRY}`
)
for (const problem of problems) console.error('  ' + problem)
console.log(`\n${problems.length} unaccepted finding(s), ${acceptedHit.size} accepted file(s)`)

for (const [file, entry] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(file)) console.log(`  accepted  ${file}  ${entry.count} - ${entry.why}`)
}

const stale = SYNTHETIC ? [] : Object.keys(ACCEPTED).filter((f) => !acceptedHit.has(f))
if (stale.length) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(', ')}`)
  process.exit(1)
}

if (problems.length) {
  console.error(
    `\npricing-owner failed. Ruling 75: "I just want a centralized domain the rest of\n` +
      `our app could call to get pricing stuff." Ask ${PUBLIC_ENTRY} for the number.`
  )
  process.exit(1)
}

console.log('pricing-owner passed')
