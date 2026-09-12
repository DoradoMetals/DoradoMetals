import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { domainDirs, isTransportFile, sourceRoot } from './lib/layout.ts'

const API_ROOT = process.env.LINT_NO_THROW_ROOT
  ? path.resolve(process.env.LINT_NO_THROW_ROOT)
  : path.join(import.meta.dirname, '..')

const SRC_ROOT = sourceRoot(API_ROOT)
const DOMAIN_ROOTS = domainDirs(API_ROOT).map((d) => path.join(SRC_ROOT, d))

// `domains/logistics/fulfillments/owner.ts` was the one entry; it raises its
// 404 through `rules.assertOwnedDraft` now, so it needed no excuse (LD F2's
// pass). `puppeteer.ts` is a new one: moved from `providers/pdfs/puppeteer.ts`
// by the provider-categorization pass (ruling 106) because the PDF renderer is
// not a third party. Its one `throw err` re-raises a browser launch failure so
// the next caller retries - infrastructure control flow, not a business
// refusal - and the move was a pure rename with no behaviour change. Routing
// it through a feature rules.ts is separate follow-up work.
const ACCEPTED: Record<string, { count: number; why: string }> = {
  'domains/documents/pdfs/render/puppeteer.ts': {
    count: 1,
    why:
      'moved from providers/pdfs/puppeteer.ts (ruling 106) - the throw re-raises a ' +
      'browser launch failure for the next caller to retry, infrastructure control ' +
      'flow rather than a business refusal; the move was a pure rename',
  },
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === 'tests') continue
    const full = path.join(dir, e)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) walk(full, out)
    else if (
      e.endsWith('.ts') &&
      !e.endsWith('.d.ts') &&
      !e.endsWith('.test.ts') &&
      e !== 'rules.ts'
    )
      out.push(full)
  }
  return out
}

function throwLines(src: string): number[] {
  const withoutBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const out: number[] = []
  withoutBlocks.split('\n').forEach((line, i) => {
    if (/\bthrow\b/.test(line.replace(/\/\/.*$/, ''))) out.push(i + 1)
  })
  return out
}

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const LOW = { LINT_NO_THROW_FLOOR: '1' }
  const manifest = {
    'package.json': JSON.stringify({ imports: { '#widgets/*': './widgets/*' } }),
  }
  const rules =
    'import { NotFound } from "#shared/errors.ts";\n' +
    'export function assertWidget<T>(row: T | null, id: string): asserts row is T {\n' +
    '  if (!row) throw new NotFound(`no widget ${id}`);\n' +
    '}\n'
  const service =
    'import * as rules from "../rules.ts";\n' +
    'export async function getOne(id: string) {\n' +
    '  const row = await repo.getOne(id);\n' +
    '  rules.assertWidget(row, id);\n' +
    '  return row;\n' +
    '}\n'

  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: 'a throw in a service is seen',
        rootEnv: 'LINT_NO_THROW_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/rules.ts': rules,
          'widgets/service.ts':
            'export async function getOne(id: string) {\n' +
            '  const row = await repo.getOne(id);\n' +
            '  if (!row) throw new NotFound(`no widget ${id}`);\n' +
            '  return row;\n' +
            '}\n',
        },
        expect: 'fail',
        mustPrint: 'widgets/service.ts:3',
      },
      {
        name: 'a throw in a non-service file under a domain is seen too',
        rootEnv: 'LINT_NO_THROW_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/rules.ts': rules,
          'widgets/compose.ts': "export function f() { throw new Error('x'); }\n",
        },
        expect: 'fail',
        mustPrint: 'widgets/compose.ts',
      },
      {
        name: 'the same refusal, moved into rules.ts, passes',
        rootEnv: 'LINT_NO_THROW_ROOT',
        env: LOW,
        files: { ...manifest, 'widgets/rules.ts': rules, 'widgets/service.ts': service },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a throw in a test file is not a finding',
        rootEnv: 'LINT_NO_THROW_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/rules.ts': rules,
          'widgets/service.ts': service,
          'widgets/tests/service.test.ts': "test('refuses', () => { throw new Error('boom'); });\n",
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'the word throw inside a comment is not a finding',
        rootEnv: 'LINT_NO_THROW_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/rules.ts': rules,
          'widgets/service.ts':
            '// rules.assertWidget will throw when the row is gone.\n' +
            '/* and this block comment mentions throw as well */\n' +
            service,
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'the floor fires on a tree far below it',
        rootEnv: 'LINT_NO_THROW_ROOT',
        files: { ...manifest, 'widgets/service.ts': service },
        expect: 'fail',
        mustPrint: 'fewer files',
      },
      {
        name: 'a missing domain dir is a broken walk, not a clean one',
        rootEnv: 'LINT_NO_THROW_ROOT',
        env: LOW,
        files: { ...manifest, 'shared/errors.ts': 'export class NotFound extends Error {}\n' },
        expect: 'fail',
        mustPrint: 'no .ts files',
      },
    ],
  })
}

const SYNTHETIC = Boolean(process.env.LINT_NO_THROW_ROOT)
const rel = (f: string) => path.relative(SRC_ROOT, f).split(path.sep).join('/')
const files = DOMAIN_ROOTS.flatMap((d) => walk(d)).filter((f) => !isTransportFile(rel(f)))

if (!DOMAIN_ROOTS.some((d) => existsSync(d)) || files.length === 0) {
  console.error(
    `lint:no-throw-in-services found no .ts files under ${DOMAIN_ROOTS.join(', ')} - ` +
      `the walk is broken, not the domains empty.`
  )
  process.exit(1)
}

const FLOOR = Number(process.env.LINT_NO_THROW_FLOOR ?? 72)
if (files.length < FLOOR) {
  console.error(
    `lint:no-throw-in-services scanned ${files.length} file(s), fewer files than ` +
      `the domains actually hold (at least ${FLOOR}). The walk broke, not the tree shrank.`
  )
  process.exit(1)
}

const found = new Map<string, number[]>()
for (const file of files) {
  const lines = throwLines(readFileSync(file, 'utf8'))
  if (lines.length) found.set(rel(file), lines)
}

const problems: string[] = []
const acceptedHit = new Set<string>()

for (const [file, lines] of [...found].sort()) {
  const entry = SYNTHETIC ? undefined : ACCEPTED[file]
  if (!entry) {
    for (const line of lines) {
      problems.push(
        `${file}:${line}  a refusal belongs in this feature's rules.ts, called as one line`
      )
    }
    continue
  }
  acceptedHit.add(file)
  if (entry.count !== lines.length) {
    problems.push(
      `${file}  ACCEPTED says ${entry.count} throw(s), the file has ${lines.length}. ` +
        (lines.length < entry.count
          ? `Good - lower the ACCEPTED count to ${lines.length} in the same diff, so the ` +
            `gain cannot be given back silently.`
          : `A NEW throw was added to an accepted file; move it to rules.ts.`)
    )
  }
}

console.log(`${files.length} domain file(s) scanned (rules.ts and tests/ excluded by design)`)
for (const p of problems) console.error('  ' + p)
console.log(`\n${problems.length} unaccepted finding(s), ${acceptedHit.size} accepted file(s)`)

let total = 0
for (const [file, entry] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(file)) {
    total += entry.count
    console.log(`  accepted  ${file}  ${entry.count} throw(s) - ${entry.why}`)
  }
}
if (acceptedHit.size) console.log(`  ${total} accepted throw(s) outstanding`)

const stale = SYNTHETIC ? [] : Object.keys(ACCEPTED).filter((f) => !acceptedHit.has(f))
if (stale.length) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(', ')}`)
  console.error('remove them - the file is gone, renamed, or already clean')
  process.exit(1)
}

if (problems.length) {
  console.error(
    `\nno-throw-in-services failed. Ruling 65: a refusal lives in the feature's\n` +
      `rules.ts as a named one-line assert the use case calls, so a service file\n` +
      `reads as what it does and every refusal a feature can make sits in one\n` +
      `file, testable without Postgres.`
  )
  process.exit(1)
}

console.log('no-throw-in-services passed')
