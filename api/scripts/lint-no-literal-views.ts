import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { domainDirs, isTransportFile, sourceRoot } from './lib/layout.ts'

const DOMAINS = domainDirs(
  process.env.LINT_NO_LITERAL_VIEWS_ROOT
    ? path.resolve(process.env.LINT_NO_LITERAL_VIEWS_ROOT)
    : path.resolve(import.meta.dirname, '..')
)
const ROOTS = ['db', 'shared', ...DOMAINS]
const underDomain = (rel: string): boolean =>
  DOMAINS.some((d) => rel === d || rel.startsWith(`${d}/`))

const API_ROOT = process.env.LINT_NO_LITERAL_VIEWS_ROOT
  ? path.resolve(process.env.LINT_NO_LITERAL_VIEWS_ROOT)
  : path.resolve(import.meta.dirname, '..')
const ROOT = sourceRoot(API_ROOT)

const HOME = 'shared/views.ts'

const CRUD =
  'a wire-to-column re-spelling, not a view - it belongs in SQL and dies with the ' +
  'CRUD pass-through pass (ruling 66)'
const RESULT = 'a small result record (counts, ids) a caller reads once - it names no table row'

const ACCEPTED: Record<string, { count: number; why: string }> = {
  'domains/checkout/adopt.ts': { count: 2, why: RESULT },
  'domains/checkout/sweep.ts': { count: 2, why: RESULT },
  'domains/accounts/images/service.ts': { count: 1, why: RESULT },
  'domains/documents/pdfs/order-inputs.ts': { count: 5, why: RESULT },
  'domains/documents/pdfs/serve.ts': { count: 4, why: RESULT },
  'domains/orders/place.ts': { count: 3, why: RESULT },
  'domains/transactions/details/service.ts': { count: 2, why: CRUD },
  'domains/transactions/sweeps.ts': { count: 2, why: RESULT },
  'domains/logistics/shipping/operations/resolver.ts': { count: 1, why: RESULT },
  'domains/logistics/shipping/services/service.ts': { count: 2, why: CRUD },
  'domains/logistics/shipping/shipments/service.ts': { count: 1, why: RESULT },
}

const acceptedHit = new Map<string, number>()

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === 'tests' || e === 'sql') continue
    const full = path.join(dir, e)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) walk(full, out)
    else if (e.endsWith('.ts') && !e.endsWith('.d.ts') && !e.endsWith('.test.ts')) out.push(full)
  }
  return out
}

function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, lead: string) => lead)
}

function closingBraceOf(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]!
    if (c === '{' || c === '[' || c === '(') depth += 1
    else if (c === '}' || c === ']' || c === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function topLevelEntries(body: string): number {
  let depth = 0
  let current = ''
  const parts: string[] = []
  for (const c of body) {
    if (c === '{' || c === '[' || c === '(') depth += 1
    else if (c === '}' || c === ']' || c === ')') depth -= 1
    if (c === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts.filter((p) => p.trim().length > 0).length
}

type Finding = { file: string; line: number; what: string }

function findingsIn(rel: string, raw: string): Finding[] {
  const src = withoutComments(raw)
  const out: Finding[] = []
  const lineOf = (i: number) => src.slice(0, i).split('\n').length

  if (rel !== HOME) {
    for (const m of src.matchAll(/\bObject\.assign\s*\(/g)) {
      out.push({
        file: rel,
        line: lineOf(m.index ?? 0),
        what: `Object.assign lives in ${HOME} only - use withDecisions(view, decisions)`,
      })
    }
  }

  if (!underDomain(rel) || isTransportFile(rel) || path.basename(rel) === 'rules.ts') return out

  for (const m of src.matchAll(/\breturn\s*\{/g)) {
    const open = (m.index ?? 0) + m[0].length - 1
    const close = closingBraceOf(src, open)
    if (close === -1) continue
    const keys = topLevelEntries(src.slice(open + 1, close))
    if (keys < 2) continue
    out.push({
      file: rel,
      line: lineOf(m.index ?? 0),
      what:
        `a returned object literal of ${keys} entries - a view is one SQL read parsed ` +
        `through its contract, and its decisions come from rules.ts`,
    })
  }

  return out
}

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const LOW = { LINT_NO_LITERAL_VIEWS_FLOOR: '1' }
  const manifest = {
    'package.json': JSON.stringify({ imports: { '#widgets/*': './widgets/*' } }),
  }
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: 'a two-key literal returned from a service is seen',
        rootEnv: 'LINT_NO_LITERAL_VIEWS_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'export function view() {\n  return { widget: row, actions: acts };\n}\n',
        },
        expect: 'fail',
        mustPrint: '2 entries',
      },
      {
        name: 'the same literal in rules.ts is a decision and passes',
        rootEnv: 'LINT_NO_LITERAL_VIEWS_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/rules.ts':
            'export function decide() {\n  return { missing: [], actions: acts };\n}\n',
        },
        expect: 'pass',
        mustPrint: '0 finding',
      },
      {
        name: 'a one-key literal is not a view',
        rootEnv: 'LINT_NO_LITERAL_VIEWS_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts': 'export function f() {\n  return { ok: true };\n}\n',
        },
        expect: 'pass',
        mustPrint: '0 finding',
      },
      {
        name: 'Object.assign anywhere but shared/views.ts is seen',
        rootEnv: 'LINT_NO_LITERAL_VIEWS_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'db/widgets/repo.ts': 'export const f = (a, b) => Object.assign(a, b);\n',
        },
        expect: 'fail',
        mustPrint: 'Object.assign lives in',
      },
      {
        name: 'Object.assign inside shared/views.ts is the one home and passes',
        rootEnv: 'LINT_NO_LITERAL_VIEWS_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'shared/views.ts': 'export const f = (a, b) => Object.assign(a, b);\n',
        },
        expect: 'pass',
        mustPrint: '0 finding',
      },
      {
        name: 'a literal in a comment is not code',
        rootEnv: 'LINT_NO_LITERAL_VIEWS_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            '// return { a: 1, b: 2 };\nexport function f() {\n  return null;\n}\n',
        },
        expect: 'pass',
        mustPrint: '0 finding',
      },
      {
        name: 'a walk that finds nothing is BROKEN, not clean',
        rootEnv: 'LINT_NO_LITERAL_VIEWS_ROOT',
        files: { ...manifest, 'README.md': 'no typescript here\n' },
        expect: 'fail',
        mustPrint: 'SCAN IS BROKEN',
      },
    ],
  })
}

const files = ROOTS.flatMap((r) => walk(path.join(ROOT, r)))
const rel = (f: string) => path.relative(ROOT, f)

const findings: Finding[] = []
for (const f of files) {
  const name = rel(f)
  const own = findingsIn(name, readFileSync(f, 'utf8'))
  if (!own.length) continue
  if (ACCEPTED[name]) {
    acceptedHit.set(name, own.length)
    continue
  }
  findings.push(...own)
}

console.log(`${files.length} file(s) scanned under ${ROOTS.map((r) => `${r}/`).join(', ')}`)
for (const f of findings) console.log(`  LITERAL  ${f.file}:${f.line}  ${f.what}`)
console.log(`\n${findings.length} finding(s), ${acceptedHit.size} file(s) accepted`)
for (const [name, entry] of Object.entries(ACCEPTED)) {
  console.log(
    `  accepted  ${name}  ${acceptedHit.get(name) ?? 0}/${entry.count}\n            ${entry.why}`
  )
}

const FLOOR = Number(process.env.LINT_NO_LITERAL_VIEWS_FLOOR ?? 267)
if (files.length < FLOOR) {
  console.error(
    `\nSCAN IS BROKEN: ${files.length} file(s) under ${ROOTS.join(', ')}, ` +
      `expected at least ${FLOOR}`
  )
  process.exit(1)
}

if (!process.env.LINT_NO_LITERAL_VIEWS_ROOT) {
  const wrong = Object.entries(ACCEPTED).filter(
    ([name, entry]) => (acceptedHit.get(name) ?? 0) !== entry.count
  )
  for (const [name, entry] of wrong) {
    console.error(
      `\nACCEPTED ${name}: ${acceptedHit.get(name) ?? 0} finding(s) found, ${entry.count} pinned`
    )
  }
  if (wrong.length) {
    console.error('update the count, or remove the entry - it can only shrink')
    process.exit(1)
  }
}

if (findings.length) process.exit(1)
