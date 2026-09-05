import fs from 'node:fs'
import path from 'node:path'
import { domainDirs } from './lib/layout.ts'

const API_ROOT = process.env.LINT_ONE_CATCH_ROOT
  ? path.resolve(process.env.LINT_ONE_CATCH_ROOT)
  : path.join(import.meta.dirname, '..')

const WALK_ROOTS = domainDirs(API_ROOT).map((d) => path.join(API_ROOT, d))

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const LOW = { LINT_ONE_CATCH_FLOOR: '1' }
  const manifest = {
    'package.json': JSON.stringify({ imports: { '#widgets/*': './widgets/*' } }),
  }
  const clean =
    'import { NotFound } from "#shared/errors.ts";\n' +
    'export async function getOne(id: string) {\n' +
    '  const row = await repo.getOne(id);\n' +
    '  if (!row) throw new NotFound(`no thing ${id}`);\n' +
    '  return row;\n' +
    '}\n'

  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: 'a try block is seen',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'export async function f() {\n  try {\n    await g();\n  } catch (err) {\n    throw err;\n  }\n}\n',
        },
        expect: 'fail',
        mustPrint: 'try {',
      },
      {
        name: 'a catch with no binding is seen',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'export async function f() {\n  try {\n    await g();\n  } catch {\n    return null;\n  }\n}\n',
        },
        expect: 'fail',
        mustPrint: 'catch',
      },
      {
        name: 'a logger call is seen',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'import { logger } from "#shared/logging/logger.ts";\n' +
            'export function f() { logger.error("nope"); }\n',
        },
        expect: 'fail',
        mustPrint: 'logger.',
      },
      {
        name: 'a console call is seen, in a controller too',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/controller.ts': 'export function f() { console.error("nope"); }\n',
        },
        expect: 'fail',
        mustPrint: 'console.',
      },
      {
        name: 'a ternary opening withTransaction on the truthy side is seen',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'export async function f(tx?: Executor) {\n' +
            '  return tx ? withTransaction(write) : write(tx);\n' +
            '}\n',
        },
        expect: 'fail',
        mustPrint: 'withTransaction(',
      },
      {
        name: 'a ternary opening withTransaction on the falsy side is seen',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'export async function f(executor?: Executor) {\n' +
            '  return executor ? write(executor) : withTransaction(write);\n' +
            '}\n',
        },
        expect: 'fail',
        mustPrint: 'withTransaction(',
      },
      {
        name: 'withTransaction inside a function that also takes an optional tx is seen',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'export async function f(x: number, executor?: Executor) {\n' +
            '  return withTransaction(async (tx) => {\n' +
            '    await write(x, tx);\n' +
            '  });\n' +
            '}\n',
        },
        expect: 'fail',
        mustPrint: 'withTransaction( with an optional',
      },
      {
        name: 'withTransaction in a use case with no optional executor/tx is not a finding',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'export async function f(x: number) {\n' +
            '  return withTransaction(async (tx) => {\n' +
            '    await write(x, tx);\n' +
            '  });\n' +
            '}\n',
        },
        expect: 'pass',
        mustPrint: '0 finding',
      },
      {
        name: 'a write function taking a required tx is not a finding',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts':
            'export async function f(x: number, tx: Executor) {\n' +
            '  await write(x, tx);\n' +
            '}\n',
        },
        expect: 'pass',
        mustPrint: '0 finding',
      },
      {
        name: 'a violation in a test file is not a finding',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: {
          ...manifest,
          'widgets/service.ts': clean,
          'widgets/tests/service.test.ts':
            'try {\n  f();\n} catch (err) {\n  console.error(err);\n}\n',
        },
        expect: 'pass',
        mustPrint: '0 finding',
      },
      {
        name: 'a clean tree passes',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: { ...manifest, 'widgets/service.ts': clean, 'widgets/controller.ts': clean },
        expect: 'pass',
        mustPrint: '0 finding',
      },
      {
        name: 'the floor fires on a tree far below it',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        files: { ...manifest, 'widgets/service.ts': clean },
        expect: 'fail',
        mustPrint: 'fewer files',
      },
      {
        name: 'a missing root is a broken walk, not an empty one',
        rootEnv: 'LINT_ONE_CATCH_ROOT',
        env: LOW,
        files: { ...manifest },
        args: ['--root-must-exist'],
        expect: 'fail',
        mustPrint: 'no .ts files',
      },
    ],
  })
}

const CATCH_ALL_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\btry\s*\{/, 'try {'],
  [/\bcatch\s*[({]/, 'catch'],
  [/\b(?:logger|log|console)\.(?:error|warn|info|debug)\s*\(/, 'logger./console.'],
]

const TERNARY_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\?\s*withTransaction\s*\(/, 'withTransaction( on the truthy side of a ternary'],
  [/:\s*withTransaction\s*\(/, 'withTransaction( on the falsy side of a ternary'],
]

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git' || e === 'dist' || e === 'tests') continue
    const full = path.join(dir, e)
    let s
    try {
      s = fs.statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) walk(full, out)
    else if (/\.ts$/.test(full) && !/\.d\.ts$/.test(full) && !/\.test\.ts$/.test(full)) {
      out.push(full)
    }
  }
  return out
}

function functionBlocks(src: string): { signature: string; body: string; startLine: number }[] {
  const out: { signature: string; body: string; startLine: number }[] = []
  const re = /function\s+\w*\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const sigStart = m.index
    const braceStart = src.indexOf('{', m.index)
    if (braceStart === -1) continue
    let depth = 0
    let i = braceStart
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    out.push({
      signature: src.slice(sigStart, braceStart),
      body: src.slice(braceStart, i + 1),
      startLine: src.slice(0, sigStart).split('\n').length,
    })
    re.lastIndex = i + 1
  }
  return out
}

const OPTIONAL_TX_PARAM = /\b(?:executor|tx)\s*\?\s*:/

const exists = WALK_ROOTS.some((r) => fs.existsSync(r))
const files = exists ? WALK_ROOTS.flatMap((r) => walk(r)) : []

if (!exists || files.length === 0) {
  console.error(
    `lint:one-catch found no .ts files under ${WALK_ROOTS.join(', ')} - the walk is ` +
      `broken, not the domains empty.`
  )
  process.exit(1)
}

const FLOOR = Number(process.env.LINT_ONE_CATCH_FLOOR ?? 167)
if (files.length < FLOOR) {
  console.error(
    `lint:one-catch scanned ${files.length} file(s), fewer files than the domains ` +
      `actually hold (at least ${FLOOR}). The walk broke, not the tree shrank.`
  )
  process.exit(1)
}

const rel = (f: string) => path.relative(API_ROOT, f)
const problems: string[] = []

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split('\n')

  for (const [pattern, label] of [...CATCH_ALL_PATTERNS, ...TERNARY_PATTERNS]) {
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        problems.push(`${rel(file)}:${i + 1}  ${label}\n      ${line.trim()}`)
      }
    })
  }

  for (const fn of functionBlocks(src)) {
    if (OPTIONAL_TX_PARAM.test(fn.signature) && /\bwithTransaction\s*\(/.test(fn.body)) {
      problems.push(
        `${rel(file)}:${fn.startLine}  withTransaction( with an optional executor?/tx? ` +
          `parameter on the same function - only a use case opens a transaction`
      )
    }
  }
}

if (problems.length) {
  console.error(
    `one-catch check failed (${problems.length} finding(s)):\n\n` +
      `  the domains carry no try/catch and no logger/console call -\n` +
      `  a refusal throws, withTransaction rolls back and rethrows, and\n` +
      `  shared/middleware/errorHandler.ts logs once. The one exception is\n` +
      `  shared/attempt.ts, for a best-effort side effect.\n\n` +
      `  A service function that writes takes tx: Executor as a REQUIRED last\n` +
      `  argument and never opens its own transaction (ruling 56).\n`
  )
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}

console.log(
  `one-catch check passed (${files.length} file${files.length === 1 ? '' : 's'} scanned, 0 findings)`
)
