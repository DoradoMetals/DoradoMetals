import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { domainDirs, sourceRoot, wildcardRoots } from './lib/layout.ts'

const API_ROOT = process.env.AUDIT_SILENT_ROOT ?? path.resolve(import.meta.dirname, '..')
const ROOT = sourceRoot(API_ROOT)

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const repo = `
    const sql = sqlFrom(import.meta.dirname);
    export async function bump(id, executor) {
      const { rows } = await query(sql("bump"), [id], executor);
      return rows.map((r) => r.id);
    }
  `
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: 'a discarded UPDATE result is seen',
        rootEnv: 'AUDIT_SILENT_ROOT',
        files: {
          'package.json': JSON.stringify({ imports: { '#x/*': './x/*' } }),
          'db/x/sql/bump.sql': 'UPDATE t SET a = 1 WHERE id = $1 RETURNING id',
          'db/x/repo.ts': repo,
          'x/service.ts': 'import * as xRepo from "#db/x/repo.ts";\nawait xRepo.bump(id, c);\n',
        },
        expect: 'fail',
        mustPrint: 'bump',
      },
      {
        name: 'an observed UPDATE result is not reported',
        rootEnv: 'AUDIT_SILENT_ROOT',
        files: {
          'package.json': JSON.stringify({ imports: { '#x/*': './x/*' } }),
          'db/x/sql/bump.sql': 'UPDATE t SET a = 1 WHERE id = $1 RETURNING id',
          'db/x/repo.ts': repo,
          'x/service.ts':
            'import * as xRepo from "#db/x/repo.ts";\nconst changed = await xRepo.bump(id, c);\n',
        },
        expect: 'pass',
        mustPrint: '0 discarded',
      },
      {
        name: 'a call through the #db barrel is still seen',
        rootEnv: 'AUDIT_SILENT_ROOT',
        files: {
          'package.json': JSON.stringify({ imports: { '#x/*': './x/*' } }),
          'db/index.ts': 'export * as xRepo from "#db/x/repo.ts";\n',
          'db/x/sql/bump.sql': 'UPDATE t SET a = 1 WHERE id = $1 RETURNING id',
          'db/x/repo.ts': repo,
          'x/service.ts': 'import { xRepo } from "#db";\nawait xRepo.bump(id, c);\n',
        },
        expect: 'fail',
        mustPrint: 'bump',
      },
      {
        name: 'an INSERT is not a finding',
        rootEnv: 'AUDIT_SILENT_ROOT',
        files: {
          'package.json': JSON.stringify({ imports: { '#x/*': './x/*' } }),
          'db/x/sql/bump.sql': 'INSERT INTO t (id) VALUES ($1) RETURNING id',
          'db/x/repo.ts': repo,
          'x/service.ts': 'import * as xRepo from "#db/x/repo.ts";\nawait xRepo.bump(id, c);\n',
        },
        expect: 'pass',
        mustPrint: '0 discarded',
      },
    ],
  })
}

const FAIL_ON_FINDINGS = process.env.AUDIT_SILENT_ROOT != null

const ACCEPTED: Record<string, string> = {
  'domains/checkout/service.ts::checkouts.clearFor':
    'a user with no basket in that direction has nothing to clear, and sql/clear_for.sql keys on (user_id, direction) precisely so the read-then-branch this replaced is gone: zero rows is the correct outcome, exactly as the early return it replaced was.',
  'domains/crm/inbox/service.ts::smsRepo.markRead':
    'marking a conversation read that already had nothing unread is not an error - the inbox list is what a caller checks afterward, not this call.',
  'domains/crm/inbox/service.ts::callsRepo.markRead':
    'same as smsRepo.markRead beside it: zero unread call rows is a normal outcome, not a failure to observe.',
  'domains/crm/leads/service.ts::smsRepo.attachToUser':
    "a lead that never texted or was texted has nothing to attach - convert still succeeds, and the customer's own timeline read is the observation, not this write.",
  'domains/crm/leads/service.ts::callsRepo.attachToUser':
    'same as smsRepo.attachToUser beside it: zero prior calls on that number is a normal outcome for a fresh lead.',
}
const acceptedHit = new Set<string>()

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git' || e === 'dist') continue
    const full = path.join(dir, e)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const LAYERS = ['db', ...domainDirs(API_ROOT)]
const ALIAS = wildcardRoots(API_ROOT)
const files = LAYERS.flatMap((layer) => walk(path.join(ROOT, layer)))
const rel = (f: string) => path.relative(ROOT, f)

type Stmt = { verb: string; returning: boolean }
const statements = new Map<string, Stmt>()
for (const f of files.filter((f) => f.endsWith('.sql'))) {
  const body = readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .trim()
  const verb = /^\s*(UPDATE|DELETE)\b/i.exec(body)?.[1]?.toUpperCase()
  if (!verb) continue
  statements.set(rel(f).replace(/\.sql$/, ''), {
    verb,
    returning: /\bRETURNING\b/i.test(body),
  })
}

type Fn = { file: string; name: string; stmt: Stmt; sqlKey: string; returnsValue: boolean }
const fns: Fn[] = []
for (const f of files.filter((f) => /repo(\.\w+)?\.(ts|js)$/.test(f))) {
  const src = readFileSync(f, 'utf8')
  const sqlDir = path.join(path.dirname(rel(f)), 'sql')
  const re =
    /export\s+async\s+function\s+(\w+)\s*\([\s\S]*?\{([\s\S]*?)(?=\n(?:export|\/\*\*|\/\/ ---)|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const [, name, body] = m as unknown as [string, string, string]
    const key =
      /sql\(\s*["'](\w+)["']\s*\)/.exec(body)?.[1] ?? /\b([A-Z_]{3,})\b\s*,/.exec(body)?.[1]
    if (!key) continue
    const direct = path.join(sqlDir, key)
    const viaConst = (() => {
      const c = new RegExp(`const\\s+${key}\\s*=\\s*sql\\(\\s*["'](\\w+)["']`).exec(src)?.[1]
      return c ? path.join(sqlDir, c) : null
    })()
    const resolved = statements.has(direct)
      ? direct
      : viaConst && statements.has(viaConst)
        ? viaConst
        : null
    if (!resolved) continue
    fns.push({
      file: rel(f),
      name,
      stmt: statements.get(resolved)!,
      sqlKey: resolved,
      returnsValue: /\breturn\s+(?!;)/.test(body),
    })
  }
}

const byFile = new Map<string, Fn[]>()
for (const fn of fns) byFile.set(fn.file, [...(byFile.get(fn.file) ?? []), fn])

const BARREL = new Map<string, string>()
try {
  const barrel = readFileSync(path.join(ROOT, 'db', 'index.ts'), 'utf8')
  for (const m of barrel.matchAll(/export\s+\*\s+as\s+(\w+)\s+from\s+["']#db\/([^"']+)["']/g)) {
    BARREL.set(m[1]!, `db/${m[2]!}`)
  }
} catch {}

function resolveSpecifier(fromFile: string, spec: string): string | null {
  const head = /^#([^/]+)\//.exec(spec)?.[1]
  const dir = head ? (ALIAS[head] ?? head) : undefined
  if (dir && LAYERS.includes(dir)) return `${dir}/${spec.slice(head!.length + 2)}`
  if (spec.startsWith('.')) {
    return path.normalize(path.join(path.dirname(fromFile), spec))
  }
  return null
}

let discarded = 0,
  unobservable = 0
const findings: string[] = []

for (const f of files.filter(
  (f) => /\.(ts|js)$/.test(f) && !/\.test\./.test(f) && !/\/tests\//.test(f)
)) {
  const src = readFileSync(f, 'utf8')
  const self = rel(f)

  const ns2file = new Map<string, string>()
  const importRe = /import\s+(?:\*\s+as\s+(\w+)|(\w+))\s+from\s+["']([^"']+)["']/g
  let im: RegExpExecArray | null
  while ((im = importRe.exec(src))) {
    const alias = (im[1] ?? im[2])!
    const target = resolveSpecifier(self, im[3]!)
    if (target) ns2file.set(alias, target)
  }

  const barrelRe = /import\s*\{([^}]+)\}\s*from\s*["']#db["']/g
  let bm: RegExpExecArray | null
  while ((bm = barrelRe.exec(src))) {
    for (const entry of bm[1]!.split(',')) {
      const [name, alias] = entry.trim().split(/\s+as\s+/)
      const target = BARREL.get((name ?? '').trim())
      if (target) ns2file.set((alias ?? name)!.trim(), target)
    }
  }

  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const call = /^\s*await\s+(\w+)\.(\w+)\s*\(/.exec(line)
    if (!call) return

    // A line that only CONTINUES a still-open argument list (or array) is
    // not a standalone statement - its result is going to whatever opened
    // that list, not being dropped. Anchoring on the previous non-blank
    // line's trailing character catches the shape prettier's arg-per-line
    // wrapping produces under printWidth:
    //   assertCreditSubject(
    //     user_id,
    //     await users.adjustCredit(user_id, op, Number(amount), tx)
    //   )
    // `await users.adjustCredit(...)` reads as a bare statement if you look
    // at only this line; the line above ends in a comma, which means it is
    // argument #2 of assertCreditSubject, not a discarded result. Before this
    // guard, the repo-wide prettier sweep manufactured exactly this shape out
    // of a call that used to share its line with `user_id,` and reported a
    // brand-new "discarded" finding for a result that was never dropped.
    let prev = i - 1
    while (prev >= 0 && lines[prev]!.trim() === '') prev -= 1
    if (prev >= 0 && /[(,[]$/.test(lines[prev]!.trim())) return

    const [, ns, name] = call as unknown as [string, string, string]
    const target = ns2file.get(ns)
    if (!target) return
    const fn = (byFile.get(target) ?? []).find((x) => x.name === name)
    if (!fn) return

    const where = `${self}:${i + 1}`
    const key = `${self}::${ns}.${name}`
    if (ACCEPTED[key]) {
      acceptedHit.add(key)
      return
    }
    if (!fn.stmt.returning && !fn.returnsValue) {
      unobservable += 1
      findings.push(
        `  UNOBSERVABLE  ${where}\n                ${ns}.${name}() -> ${fn.stmt.verb} ${fn.sqlKey}\n                no RETURNING and the repo hands nothing back: zero rows is indistinguishable from success`
      )
    } else {
      discarded += 1
      findings.push(
        `  DISCARDED     ${where}\n                ${ns}.${name}() -> ${fn.stmt.verb} ${fn.sqlKey}\n                the repo returns a result and the caller drops it`
      )
    }
  })
}

console.log(
  `${statements.size} UPDATE/DELETE statement(s), ${fns.length} repo function(s) running one\n`
)
for (const f of findings) console.log(f)
console.log(
  `\n${discarded} discarded result(s), ${unobservable} unobservable call(s), ${acceptedHit.size} accepted`
)

for (const [key, why] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(key)) console.log(`  accepted  ${key}\n            ${why}`)
}

const stale = Object.keys(ACCEPTED).filter((k) => !acceptedHit.has(k))
if (stale.length && !FAIL_ON_FINDINGS) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched no call:`)
  for (const k of stale) console.error(`  ${k}`)
  console.error('remove them - the call they excuse is gone or has changed shape')
  process.exit(1)
}

if (!FAIL_ON_FINDINGS && statements.size === 0) {
  console.error('\nSCAN IS BROKEN: no UPDATE or DELETE statements found at all')
  process.exit(1)
}
if (FAIL_ON_FINDINGS && (discarded || unobservable)) process.exit(1)

// 16 since the gaps lane. The two added are both "delete the detail row if
// there is one": cancelSchedule now clears a DROPOFF beside the pickup and the
// direct, and cancelling a refiner order releases its lots. Zero rows is the
// correct outcome for each - a fulfillment has one detail row of one kind, and
// a refiner order may hold no lots at all.
const CEILING = 16
if (!FAIL_ON_FINDINGS) {
  const total = discarded + unobservable
  if (total > CEILING) {
    console.error(
      `\n${total} silent mutation(s), and the agreed ceiling is ${CEILING}.\n` +
        `Something new discards a mutation result. Either observe it - see\n` +
        `shared/observability/report.ts, and D202 for the five that were fixed\n` +
        `that way - or raise the ceiling with a reason.`
    )
    process.exit(1)
  }
  if (total < CEILING) {
    console.error(
      `\n${total} silent mutation(s), below the ceiling of ${CEILING}. Good -\n` +
        `now lower CEILING to ${total} so the gain cannot be given back silently.`
    )
    process.exit(1)
  }
}
