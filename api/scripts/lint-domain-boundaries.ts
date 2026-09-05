import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { domainDirs, sourceRoot } from './lib/layout.ts'

const ROOT = process.env.LINT_DOMAIN_BOUNDARIES_ROOT
  ? path.resolve(process.env.LINT_DOMAIN_BOUNDARIES_ROOT)
  : path.join(import.meta.dirname, '..')

const CONTRACTS = existsSync(path.join(ROOT, 'contracts'))
  ? path.join(ROOT, 'contracts')
  : path.join(ROOT, '..', 'packages', 'contracts', 'src')

const SRC_ROOT = sourceRoot(ROOT)
const DOMAIN_DIR = new Map(domainDirs(ROOT).map((d) => [path.basename(d), d]))
// A lane is named by its domain; where that domain lives is the manifest's answer.
const laneDir = (dir: string): string => {
  const [head, ...rest] = dir.split('/')
  return path.join(SRC_ROOT, DOMAIN_DIR.get(head!) ?? head!, ...rest)
}

const LANES: { dir: string; forbidden: string[]; why: string }[] = [
  {
    dir: 'checkout',
    forbidden: ['fulfillments', 'shipping'],
    why: 'checkout holds a fulfillment_id and asks fulfillments.missing (ruling 70)',
  },
  {
    dir: 'orders',
    forbidden: ['fulfillments', 'shipping'],
    why: 'an order attaches a fulfillment and asks shipping for a label (rulings 67/69)',
  },
  {
    dir: 'logistics/fulfillments',
    forbidden: ['checkout'],
    why: "a draft belongs to a checkout; the checkout's own columns are its own",
  },
]

const ACCEPTED: Record<string, { count: number; why: string }> = {
  'domains/orders/service.ts': {
    count: 10,
    why:
      'the ADMIN cancel and the hand-entered tracking number. `cancel` takes ' +
      "OrderCancelBody's carrier_service_id + package_id - an admin choosing the " +
      "RETURN parcel's box and service, which no fulfillment draft describes " +
      'because a return leg is not a handover the customer made; updateTracking ' +
      'records a number an admin was given by phone. Both write through ' +
      "logistics/shipping's own service, so the parcel's columns are still " +
      "shipping's to write - what is named here is the admin's INPUT.",
  },
  'domains/orders/rules.ts': {
    count: 1,
    why:
      '`OrderActions.buy_label` and `update_tracking` are answered from the ' +
      "parcel's own state (ruling 67: 'the parcel exists and carries no label, " +
      "so POST /api/shipments/:id/label will accept'). Reading tracking_number " +
      "to decide whether a BUTTON is offered is the admin drawer's question, " +
      'not a customer handover decision.',
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

const columnsBySchema = new Map<string, Set<string>>()
let tablesRead = 0

for (const file of walk(CONTRACTS)) {
  const src = readFileSync(file, 'utf8')
  const start = src.indexOf('// generated:start')
  const end = src.indexOf('// generated:end')
  if (start === -1 || end === -1) continue
  const generated = src.slice(start, end)
  const table = /\/\/ Postgres table: ([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)/.exec(generated)
  if (!table) continue
  const schema = table[1]
  const columns = columnsBySchema.get(schema) ?? new Set<string>()
  // ["'] - quoteProps:"preserve" keeps generated column keys quoted, but the
  // repo's singleQuote:true means the quote CHARACTER is now `'`, not `"`.
  for (const m of generated.matchAll(/^\s*["']([A-Za-z_][A-Za-z0-9_]*)["']:/gm)) columns.add(m[1])
  columnsBySchema.set(schema, columns)
  tablesRead += 1
}

const owners = new Map<string, Set<string>>()
for (const [schema, columns] of columnsBySchema) {
  for (const column of columns) {
    const set = owners.get(column) ?? new Set<string>()
    set.add(schema)
    owners.set(column, set)
  }
}
const rowPointerFor = (schema: string): string =>
  `${schema.endsWith('s') ? schema.slice(0, -1) : schema}_id`

const guardable = (schema: string, column: string): boolean =>
  owners.get(column)?.size === 1 && column.includes('_') && column !== rowPointerFor(schema)

const unambiguous = (schema: string): Set<string> =>
  new Set([...(columnsBySchema.get(schema) ?? [])].filter((c) => guardable(schema, c)))

const guarded = new Map<string, Set<string>>()
for (const lane of LANES) {
  for (const schema of lane.forbidden) {
    if (!guarded.has(schema)) guarded.set(schema, unambiguous(schema))
  }
}

type Finding = { file: string; line: number; what: string }

const lineOf = (src: string, index: number): number => src.slice(0, index).split('\n').length

function findingsIn(rel: string, raw: string, forbidden: string[], why: string): Finding[] {
  const src = withoutComments(raw)
  const out: Finding[] = []
  for (const schema of forbidden) {
    for (const column of guarded.get(schema) ?? []) {
      const re = new RegExp(`\\b${column}\\b`, 'g')
      for (const m of src.matchAll(re)) {
        out.push({
          file: rel,
          line: lineOf(src, m.index ?? 0),
          what: `names \`${column}\`, a column of the \`${schema}\` schema - ${why}`,
        })
      }
    }
  }
  return out.sort((a, b) => a.line - b.line)
}

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const LOW = { LINT_DOMAIN_BOUNDARIES_FLOOR: '1', LINT_DOMAIN_BOUNDARIES_TABLES: '2' }

  const entity = (schema: string, table: string, columns: string[]) =>
    '// generated:start\n' +
    `// Postgres table: ${schema}.${table}\n` +
    `export const X = z.object({\n` +
    columns.map((c) => `  "${c}": z.string(),\n`).join('') +
    '});\n' +
    '// generated:end\n'

  const checkoutEntity = entity('checkout', 'checkouts', [
    'id',
    'user_id',
    'payment_details_id',
    'checkout_id',
  ])
  const shipmentEntity = entity('shipping', 'shipments', [
    'id',
    'user_id',
    'package_id',
    'carrier_service_id',
    'length',
  ])
  const clean = 'export const missing = async (id) => await fulfillments.missing(id);\n'

  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: 'checkout naming a shipping column is seen',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/rules.ts': "const owed = row.package_id ? [] : ['package'];\n",
        },
        expect: 'fail',
        mustPrint: 'checkout/rules.ts',
      },
      {
        name: 'the column is named in the message, so the fix is obvious',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': "const x = 'carrier_service_id';\n",
        },
        expect: 'fail',
        mustPrint: 'carrier_service_id',
      },
      {
        name: 'orders is held to the same rule as checkout',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'orders/place.ts': 'const box = checkout.package_id;\n',
        },
        expect: 'fail',
        mustPrint: 'orders/place.ts',
      },
      {
        name: 'the rule is symmetric: fulfillments may not name a checkout column',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'logistics/fulfillments/rules.ts': 'const paid = row.payment_details_id != null;\n',
        },
        expect: 'fail',
        mustPrint: 'payment_details_id',
      },
      {
        name: 'a domain naming its OWN columns is fine',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': 'const paid = row.payment_details_id != null;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: "the other domain's own row id is the currency of the boundary",
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'logistics/fulfillments/drafts.ts': 'const draft = (checkout_id) => checkout_id;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a single-word column name is a word, not a lane crossing',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': 'const n = rows.length;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a name owned by two schemas identifies nothing and is not a finding',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': 'const who = row.user_id;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a column named only in a comment is not a finding',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': '// package_id used to live here\n' + clean,
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a longer identifier that merely contains the name is not a finding',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': 'const legacy_package_id_note = 1;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a domain outside the lanes is not scanned',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': clean,
          'quotes/service.ts': 'const box = row.package_id;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a test file is not a finding',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: LOW,
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': clean,
          'checkout/tests/x.test.ts': 'const box = row.package_id;\n',
        },
        expect: 'pass',
        mustPrint: '0 unaccepted',
      },
      {
        name: 'a tree with no contracts to read is broken, not clean',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: { LINT_DOMAIN_BOUNDARIES_FLOOR: '1' },
        files: { 'checkout/service.ts': 'const box = row.package_id;\n' },
        expect: 'fail',
        mustPrint: 'no contract',
      },
      {
        name: 'the file floor fires on a tree far below it',
        rootEnv: 'LINT_DOMAIN_BOUNDARIES_ROOT',
        env: { LINT_DOMAIN_BOUNDARIES_TABLES: '2' },
        files: {
          'contracts/checkout.ts': checkoutEntity,
          'contracts/shipping.ts': shipmentEntity,
          'checkout/service.ts': clean,
        },
        expect: 'fail',
        mustPrint: 'fewer files',
      },
    ],
  })
}

const SYNTHETIC = Boolean(process.env.LINT_DOMAIN_BOUNDARIES_ROOT)

const TABLES_FLOOR = Number(process.env.LINT_DOMAIN_BOUNDARIES_TABLES ?? 40)
if (tablesRead < TABLES_FLOOR) {
  console.error(
    `lint:domain-boundaries read ${tablesRead} contract table(s) from ${CONTRACTS}, ` +
      `fewer than the ${TABLES_FLOOR} it expects. With no contract schemas to compare ` +
      `against, every lane looks clean - this is a broken read, not a clean tree.`
  )
  process.exit(1)
}

if (!SYNTHETIC) {
  const control: [string, string][] = [
    ['shipping', 'package_id'],
    ['shipping', 'carrier_service_id'],
    ['fulfillments', 'pickup_address_id'],
  ]
  const lost = control.filter(([schema, column]) => !guarded.get(schema)?.has(column))
  if (lost.length) {
    console.error(
      `lint:domain-boundaries lost its control names: ` +
        lost.map(([s, c]) => `${s}.${c}`).join(', ') +
        `. Either the contracts moved or the ambiguity filter is eating the map.`
    )
    process.exit(1)
  }
}

const rel = (f: string) => path.relative(SRC_ROOT, f).split(path.sep).join('/')

let scanned = 0
const byFile = new Map<string, Finding[]>()
for (const lane of LANES) {
  for (const file of walk(laneDir(lane.dir))) {
    scanned += 1
    const found = findingsIn(rel(file), readFileSync(file, 'utf8'), lane.forbidden, lane.why)
    if (found.length) byFile.set(rel(file), found)
  }
}

const FLOOR = Number(process.env.LINT_DOMAIN_BOUNDARIES_FLOOR ?? 50)
if (scanned < FLOOR) {
  console.error(
    `lint:domain-boundaries scanned ${scanned} file(s), fewer files than the lanes ` +
      `actually hold (at least ${FLOOR}). The walk broke, not the tree shrank.`
  )
  process.exit(1)
}

const problems: string[] = []
const acceptedHit = new Set<string>()

for (const [file, found] of [...byFile].sort()) {
  const entry = SYNTHETIC ? undefined : ACCEPTED[file]
  if (!entry) {
    for (const f of found) problems.push(`${f.file}:${f.line}  ${f.what}`)
    continue
  }
  acceptedHit.add(file)
  if (entry.count !== found.length) {
    problems.push(
      `${file}  ACCEPTED says ${entry.count} finding(s), the file has ${found.length}. ` +
        (found.length < entry.count
          ? `Good - lower the ACCEPTED count to ${found.length} in the same diff.`
          : `A NEW cross-lane column name was added to an accepted file.`)
    )
  }
}

const guardedTotal = [...guarded.values()].reduce((n, s) => n + s.size, 0)
console.log(
  `${scanned} file(s) across ${LANES.length} lane(s) scanned against ` +
    `${guardedTotal} unambiguous column name(s) from ${tablesRead} contract table(s)`
)
for (const p of problems) console.error('  ' + p)
console.log(`\n${problems.length} unaccepted finding(s), ${acceptedHit.size} accepted file(s)`)

let total = 0
for (const [file, entry] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(file)) {
    total += entry.count
    console.log(`  accepted  ${file}  ${entry.count} finding(s) - ${entry.why}`)
  }
}
if (acceptedHit.size) console.log(`  ${total} accepted finding(s) outstanding`)

const stale = SYNTHETIC ? [] : Object.keys(ACCEPTED).filter((f) => !acceptedHit.has(f))
if (stale.length) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(', ')}`)
  console.error('remove them - the file is gone, renamed, or already clean')
  process.exit(1)
}

if (problems.length) {
  console.error(
    `\ndomain-boundaries failed. Ruling 70: "The only thing that should be deciding\n` +
      `if fulfillments is 'ready' is fulfillments." Hold an id and ask the owner -\n` +
      `fulfillments.missing(fulfillment_id) is the one call checkout makes.`
  )
  process.exit(1)
}

console.log('domain-boundaries passed')
