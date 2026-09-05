import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.env.LINT_IMPORTS_ROOT
  ? path.resolve(process.env.LINT_IMPORTS_ROOT)
  : path.resolve(import.meta.dirname, '..')

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const Q = String.fromCharCode(34)
  const imp = (what, spec) => `import ${what} from ${Q}${spec}${Q};\n`
  const base = {
    'package.json': JSON.stringify({
      imports: { '#shared/*': './shared/*', '#example/*': './example/*' },
    }),
    'shared/db/query.ts': 'export default function query() {}\n',
    'example/a/service.js':
      imp('query', '#shared/db/query.ts') + 'export const a = () => query();\n',
  }
  const LOW = { LINT_IMPORTS_FLOOR: '1' }
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: 'a relative specifier pointing at nothing is seen',
        rootEnv: 'LINT_IMPORTS_ROOT',
        env: LOW,
        files: { ...base, 'example/b/service.js': imp('x', './gone.js') + 'export default x;\n' },
        expect: 'fail',
        mustPrint: 'file does not exist',
      },
      {
        name: 'a #subpath with no package.json entry is seen',
        rootEnv: 'LINT_IMPORTS_ROOT',
        env: LOW,
        files: {
          ...base,
          'example/b/service.js': imp('x', '#nope/thing.js') + 'export default x;\n',
        },
        expect: 'fail',
        mustPrint: 'no matching entry in package.json imports',
      },
      {
        name: 'a .js specifier is NOT satisfied by a .ts file - the miss the negative control caught',
        rootEnv: 'LINT_IMPORTS_ROOT',
        env: LOW,
        files: {
          ...base,
          'example/b/service.ts': 'export const b = 1;\n',
          'example/c/controller.js': imp('{ b }', '../b/service.js') + 'export default b;\n',
        },
        expect: 'fail',
        mustPrint: 'file does not exist',
      },
      {
        name: 'a commented-out import is not evidence',
        rootEnv: 'LINT_IMPORTS_ROOT',
        env: LOW,
        files: {
          ...base,
          'example/b/service.js': '// ' + imp('x', './gone.js') + 'export const b = 1;\n',
        },
        expect: 'pass',
        mustPrint: '0 unresolved',
      },
      {
        name: 'a clean tree passes',
        rootEnv: 'LINT_IMPORTS_ROOT',
        env: LOW,
        files: base,
        expect: 'pass',
        mustPrint: '0 unresolved',
      },
      {
        name: 'the floor itself fires on a tree far below it',
        rootEnv: 'LINT_IMPORTS_ROOT',
        files: base,
        expect: 'fail',
        mustPrint: 'the walk is broken',
      },
    ],
  })
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const SUBPATHS = pkg.imports ?? {}

function sourceFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(js|ts|mjs|d\.ts)$/.test(entry.name)) out.push(full)
  }
  return out
}

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g

// A string literal's body is kept verbatim only when it is itself the
// specifier argument - immediately after `from` or `import(` - because that
// is the one place SPECIFIER is meant to match. Every other string is
// arbitrary data (an object value, a self-test's fixture "file content", a
// fake route registration used as an example) and its characters must not be
// re-scanned as if they were top-level code. Before this guard, a self-test
// fixture like `'... from "#db/x/repo.ts"; ...'` (a fake import, written as
// DATA one string deep) was invisible only because it happened to be
// double-escaped (`\"..\"`) in the hand-written double-quote style - the
// escape put a backslash where SPECIFIER needed a bare quote. The repo-wide
// prettier sweep switched the OUTER string to single quotes, which made the
// now-unnecessary escapes on the inner double quotes disappear, and the
// fixture text became indistinguishable from a real import. Blanking every
// non-specifier string's body (replacing it with an equal-length run of
// spaces, so a reported line number - if this file ever needs one - still
// lines up) fixes that for good, independent of which quote style is live.
const PRECEDED_BY_IMPORT_KEYWORD = /(?:\bfrom|\bimport\s*\()\s*$/

function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i += 1
    } else if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c
      const isSpecifier = PRECEDED_BY_IMPORT_KEYWORD.test(out)
      let body = ''
      i += 1
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          body += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        body += src[i]
        i += 1
      }
      i += 1
      out += isSpecifier ? quote + body + quote : quote + body.replace(/[^\n]/g, ' ') + quote
    } else {
      out += c
      i += 1
    }
  }
  return out
}

function resolveSubpath(spec) {
  if (SUBPATHS[spec]) return path.join(ROOT, SUBPATHS[spec])
  for (const [pattern, target] of Object.entries(SUBPATHS)) {
    if (!pattern.endsWith('/*')) continue
    const prefix = pattern.slice(0, -1)
    if (spec.startsWith(prefix)) {
      return path.join(ROOT, target.slice(0, -1) + spec.slice(prefix.length))
    }
  }
  return null
}

function candidates(resolved) {
  return [resolved, path.join(resolved, 'index.js'), path.join(resolved, 'index.ts')]
}

const problems = []
let checked = 0

for (const file of sourceFiles(ROOT)) {
  const src = stripComments(fs.readFileSync(file, 'utf8'))
  for (const match of src.matchAll(SPECIFIER)) {
    const spec = match[1]
    let resolved = null
    if (spec.startsWith('#')) resolved = resolveSubpath(spec)
    else if (spec.startsWith('.')) resolved = path.resolve(path.dirname(file), spec)
    else continue

    if (resolved === null) {
      problems.push({ file, spec, why: 'no matching entry in package.json imports' })
      continue
    }
    checked += 1
    if (!candidates(resolved).some((c) => fs.existsSync(c))) {
      problems.push({ file, spec, why: 'file does not exist' })
    }
  }
}

const FLOOR = process.env.LINT_IMPORTS_ROOT ? Number(process.env.LINT_IMPORTS_FLOOR ?? 900) : 900
if (checked < FLOOR) {
  console.error(
    `lint:imports resolved only ${checked} specifier(s), expected at least ${FLOOR} - ` +
      `the walk is broken, not the codebase clean`
  )
  process.exit(1)
}

for (const p of problems) {
  console.log(`${path.relative(ROOT, p.file)}  ->  ${p.spec}   (${p.why})`)
}

console.log(`\n${checked} internal import(s) checked, ${problems.length} unresolved`)
process.exit(problems.length ? 1 : 0)
