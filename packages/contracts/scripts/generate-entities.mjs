// Generates ONE FILE PER DATABASE ENTITY, from information_schema.
//
// Replaces generate-tables.mjs, which wrote one file per SCHEMA holding every
// table's row schema. The database shape is one file per table, so the
// contracts are too: src/<schema>/<table>.ts, and a consumer writes
// `orders.items.Row` rather than reaching into a 596-line barrel.
//
// Each entity file has a GENERATED REGION delimited by the two markers below.
// The generator owns that region and NOTHING ELSE: everything under it is
// hand-written derivations (New, Patch, named reads), each a .pick()/.omit()/
// .extend() of a Row. So regenerating after a column is added rewrites the
// region in place and leaves the derivations alone.
//
// The generator CREATES a missing entity file (region plus an empty hand
// section) and REWRITES the region of an existing one. It never deletes a
// file: a table dropped from the database leaves its contract behind, and
// verify:fresh reports it rather than this quietly removing derivations.
//
// Enums are emitted ONCE, into their OWNING schema's enums.ts, and imported by
// every table that uses one - across schemas where necessary. Two schemas hold
// different types with the same name (orders.direction is purchase/sale,
// shipping.direction is Inbound/Outbound/Return), so they are keyed by schema
// AND name and never collapsed.
//
// Fully generated, no hand section, compared byte-for-byte by verify:fresh:
//   src/<schema>/enums.ts     the schema's enum types
//   src/<schema>/index.ts     the table namespaces of one schema
//   src/schemas.ts            the schema namespaces; src/index.ts re-exports it
//
//   pnpm --filter @dorado/contracts generate
//   CONTRACT_SCHEMAS=exchange,orders pnpm --filter @dorado/contracts generate
//
// READS api/.env, NOT ITS OWN COPY. `import "dotenv/config"` loads .env
// relative to the CURRENT WORKING DIRECTORY, and this package had its own -
// carrying a second copy of the database password and a connection string
// naming a database that no longer exists. api/src/env.ts resolves from its own
// file location for exactly this reason.
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import prettier from 'prettier'

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'api', '.env'),
})

// The committed src/ is swept by the repo-wide prettier hook, so a fresh
// generation has to come out already formatted the same way - otherwise
// every regeneration would fight `prettier --write` and verify:fresh would
// never agree with itself. Resolved from THIS SCRIPT's own path, not OUTDIR:
// verify:fresh points OUTDIR at a scratch directory under os.tmpdir() with
// no .prettierrc above it, so resolving from there would silently fall back
// to prettier's defaults and produce output that never matches the real one.
const PRETTIER_CONFIG = (await prettier.resolveConfig(path.join(import.meta.dirname, 'x.ts'))) ?? {}

// Formats a snippet IN ISOLATION - used for a table's generated region, which
// is spliced between hand-written code that already went through the same
// hook. Isolating it means the formatted region is a pure function of the
// schema data alone, so the same input produces byte-identical output whether
// it lands beside real derivations (the committed file) or beside the
// placeholder comment verify:fresh's fresh generation writes (a brand-new
// file in its scratch directory) - which is exactly what the region
// comparison in verify-fresh.mjs requires. Trailing newlines are trimmed
// because the splice sites below supply their own blank line.
//
// quoteProps: "preserve" OVERRIDES the repo default (prettier's own
// "as-needed" would strip the quotes off every column key that happens to be
// a valid identifier - "id": z.string() -> id: z.string()). Column names are
// what several lints (lint-domain-boundaries, lint-no-column-arrays) scan the
// generated region FOR, matching `"column_name":` at the start of a line, so
// stripping the quotes does not just look different, it makes those columns
// invisible to every lint that greps for them. The repo-wide sweep hit this
// for real: three lints lost their column names the moment the generated
// files were reformatted with the repo's default quoteProps.
const formatRegion = async (text) =>
  (
    await prettier.format(text, {
      ...PRETTIER_CONFIG,
      parser: 'typescript',
      quoteProps: 'preserve',
    })
  ).replace(/\n+$/, '')

// Formats a WHOLE generated file (enums.ts, a schema's index.ts, schemas.ts) -
// nothing hand-written follows, so there is no splice boundary to protect.
const formatFile = async (text) =>
  prettier.format(text, { ...PRETTIER_CONFIG, parser: 'typescript' })

// Every schema the API reads. exchange is frozen but still read by scripts and
// by the payouts feature, so it gets entities like everything else.
// `exchange` IS NOT HERE, and that is the point (Jacob, 2026-09-03: "why do we
// still have all the exchange contracts?"). The legacy schema is frozen, no
// application code imports one of its rows, and the backfill and audit scripts
// read it through their own raw SQL. Generating 39 contracts nobody imports
// only made the flat namespace collide with itself.
const DEFAULT_SCHEMAS = [
  'leads',
  'lots',
  'reviews',
  'rates',
  'spots',
  'products',
  'media',
  'organizations',
  'metals',
  'orders',
  'shipping',
  'tax',
  'payments',
  'fulfillments',
  'places',
  'auth',
  'checkout',
  'crm',
  'refiners',
  'refining',
].join(',')

const SCHEMAS = (process.env.CONTRACT_SCHEMAS ?? DEFAULT_SCHEMAS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Overridable so verify:fresh can generate somewhere else and compare, rather
// than overwriting the committed files to find out whether they differ.
const OUTDIR = process.env.CONTRACT_OUTDIR ?? path.join(import.meta.dirname, '..', 'src')

export const START = '// generated:start'
export const END = '// generated:end'

// Contracts describe what crosses the wire, not what the driver hands back.
// Timestamps are therefore strings: they are ISO-8601 by the time they have
// been through JSON.stringify, whatever pg returned in process.
const TYPE_MAP = {
  uuid: 'z.string().uuid()',
  text: 'z.string()',
  character: 'z.string()',
  'character varying': 'z.string()',
  boolean: 'z.boolean()',
  numeric: 'z.number()',
  integer: 'z.number().int()',
  bigint: 'z.number().int()',
  smallint: 'z.number().int()',
  'double precision': 'z.number()',
  real: 'z.number()',
  date: 'z.string()',
  'time without time zone': 'z.string()',
  'time with time zone': 'z.string()',
  'timestamp with time zone': 'z.string()',
  'timestamp without time zone': 'z.string()',
  jsonb: 'z.unknown()',
  json: 'z.unknown()',
  bytea: 'z.string()', // encoded to base64 in the queries that select it
}

// `public` is a reserved word in strict mode, and every module is strict, so
// `export * as public` does not parse. A schema whose name is reserved is
// exported under a `_schema` suffix; only `public` hits it, and only because
// exchange.sales_tax_rules is typed by two enums that live there.
const RESERVED = new Set([
  'public',
  'private',
  'protected',
  'static',
  'package',
  'implements',
  'interface',
  'let',
  'yield',
  'await',
  'enum',
  'default',
])
const exportName = (schema) => (RESERVED.has(schema) ? `${schema}_schema` : schema)

const pascal = (s) =>
  s
    .split(/[_\s]+/)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')

// THE ENTITY'S NAME IS ITS EXPORT (Jacob, 2026-09-03: "I don't think it needs
// to be rates.rates.New. Do you not understand how dumb that looks? It should
// be Rate. That's it."). Flat, singular, PascalCase - one namespace for the
// whole package, so a collision is resolved by the name the code already uses
// for the concept (orders.items is an OrderItem, checkout.items is a
// CheckoutItem) and never by a schema prefix. `exchange` is the exception and
// the prefix IS the concept there: those rows are the frozen legacy table,
// read by scripts. The three exchange tables still on a live path keep their
// live names.
const ENTITY = {
  'auth.account': 'AuthAccount',
  'auth.employees': 'Employee',
  'auth.otp_throttles': 'AuthOtpThrottle',
  'auth.pending_changes': 'AuthPendingChange',
  'auth.pending_signups': 'AuthPendingSignup',
  'auth.sessions': 'Session',
  'auth.users': 'User',
  'auth.verification': 'Verification',

  'checkout.checkouts': 'Checkout',
  'checkout.items': 'CheckoutItem',
  'checkout.lots': 'CheckoutLot',

  'crm.calls': 'Call',
  'crm.sms_messages': 'SmsMessage',

  'fulfillments.directs': 'FulfillmentDirect',
  'fulfillments.dropoffs': 'FulfillmentDropoff',
  'fulfillments.fulfillments': 'Fulfillment',
  'fulfillments.methods': 'FulfillmentMethod',
  'fulfillments.pickups': 'FulfillmentPickup',
  'fulfillments.shipments': 'FulfillmentShipment',

  'leads.leads': 'Lead',

  'lots.items': 'Lot',

  'media.emails': 'Email',
  'media.images': 'Image',
  'media.pdfs': 'Pdf',

  'metals.metals': 'Metal',
  'metals.purity_labels': 'PurityLabel',

  'orders.addresses': 'OrderAddressLink',
  'orders.items': 'OrderItem',
  'orders.lots': 'OrderLot',
  'orders.orders': 'Order',
  'orders.spots': 'OrderSpot',
  'orders.transactions': 'OrderTotals',

  'organizations.organizations': 'Organization',

  'payments.attempts': 'PaymentAttempt',
  'payments.bank_links': 'BankLink',
  'payments.feed_cursors': 'FeedCursor',
  'payments.inbound_transactions': 'InboundTransaction',
  'payments.details': 'PaymentDetails',
  'payments.intents': 'PaymentIntent',
  'payments.ledger': 'LedgerEntry',
  'payments.methods': 'PaymentMethod',
  'payments.settlements': 'PaymentSettlement',
  'payments.transfer_events': 'TransferEvent',
  'payments.transfers': 'Transfer',
  'payments.stripe_charges': 'StripeCharge',

  'places.addresses': 'Address',
  'places.location_hours': 'LocationHours',
  'places.locations': 'Location',
  'places.user_addresses': 'UserAddress',

  'products.bullion': 'Bullion',
  'products.mints': 'Mint',

  'rates.rates': 'Rate',

  'refiners.items': 'RefinerItem',
  'refiners.orders': 'RefinerOrder',
  'refiners.refiners': 'Refiner',
  'refiners.spots': 'RefinerSpot',

  'refining.orders': 'RefiningOrder',
  'refining.lots': 'RefiningLot',
  'refining.pool': 'PoolEntry',

  'reviews.reviews': 'Review',

  'shipping.carriers': 'Carrier',
  'shipping.packages': 'Package',
  'shipping.pickups': 'ShipmentPickup',
  'shipping.services': 'CarrierService',
  'shipping.shipments': 'Shipment',
  'shipping.tracking': 'TrackingRecord',

  'spots.spots': 'Spot',

  'tax.sales_tax': 'SalesTax',
  'tax.sales_tax_rules': 'SalesTaxRule',
}

// Two schemas hold a `direction` enum and they are different types, so the
// flat namespace has to tell them apart: orders.direction is purchase/sale and
// is THE direction of this business; shipping.direction is a parcel's leg.
// (`public` owned two more, used only by exchange.sales_tax_rules; they left
// with the exchange contracts.)
// crm.sms_status and crm.call_status are the DELIVERY state of a row; the
// flat namespace already spends SmsStatus and CallStatus on the provider's
// status callbacks, which are different shapes with the same words in them.
const ENUM_NAME = {
  'shipping.direction': 'ShipmentDirection',
  'fulfillments.category': 'FulfillmentCategory',
  'crm.sms_status': 'SmsDeliveryStatus',
  'crm.call_status': 'CallState',
  'refining.direction': 'RefiningDirection',
  'refining.pool_entry': 'PoolEntryKind',
}

const entityName = (schema, table) => {
  const n = ENTITY[`${schema}.${table}`]
  if (!n) {
    console.error(`no entity name for ${schema}.${table} - add one to ENTITY in this generator`)
    process.exit(1)
  }
  return n
}

const enumName = (schema, name) => ENUM_NAME[`${schema}.${name}`] ?? pascal(name)

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const target = new URL(process.env.DATABASE_URL)
console.log(`reading from ${target.pathname.slice(1)} @ ${target.hostname}`)

const { rows: enumRows } = await client.query(`
  SELECT n.nspname AS schema, t.typname AS name, e.enumlabel AS label
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  ORDER BY n.nspname, t.typname, e.enumsortorder
`)
const enums = {}
for (const r of enumRows) (enums[`${r.schema}.${r.name}`] ??= new Set()).add(r.label)

// Read every schema's tables and columns first, so enum ownership is known
// before a single file is written.
const model = []
for (const schema of SCHEMAS) {
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schema]
  )
  if (!tables.length) {
    console.log(`  ${schema}: no tables, skipped`)
    continue
  }
  const { rows: columns } = await client.query(
    `SELECT table_name, column_name, data_type, udt_schema, udt_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = $1
     ORDER BY table_name, ordinal_position`,
    [schema]
  )
  const byTable = {}
  for (const c of columns) (byTable[c.table_name] ??= []).push(c)
  model.push({ schema, tables: tables.map((t) => t.table_name), byTable })
}

await client.end()

// Which enums are actually used, and by which schema they are owned.
const usedEnums = new Map() // ownerSchema -> Map(enumName -> values[])
for (const { byTable } of model) {
  for (const cols of Object.values(byTable)) {
    for (const c of cols) {
      const qualified = `${c.udt_schema}.${c.udt_name}`
      if (c.data_type !== 'USER-DEFINED' || !enums[qualified]) continue
      const owner = usedEnums.get(c.udt_schema) ?? new Map()
      owner.set(c.udt_name, [...enums[qualified]])
      usedEnums.set(c.udt_schema, owner)
    }
  }
}

const HEAD = (subject) =>
  `// GENERATED by packages/contracts/scripts/generate-entities.mjs\n` +
  `// Run \`pnpm --filter @dorado/contracts generate\` to refresh.\n` +
  `//\n// ${subject}\n`

const unmapped = new Set()
const written = []
const wholeFiles = []

const writeFile = (rel, body) => {
  const full = path.join(OUTDIR, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, body)
}

// ---------------------------------------------------------------- enums.ts
for (const [owner, byName] of usedEnums) {
  const lines = [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => {
      const n = enumName(owner, name)
      return (
        `export const ${n} = z.enum([${values.map((v) => JSON.stringify(v)).join(', ')}]);\n` +
        `export type ${n} = z.infer<typeof ${n}>;`
      )
    })
  writeFile(
    `${owner}/enums.ts`,
    await formatFile(
      `${HEAD(`Postgres enum types owned by the \`${owner}\` schema.`)}import { z } from "zod/v4";\n\n${lines.join('\n\n')}\n`
    )
  )
  wholeFiles.push(`${owner}/enums.ts`)
}

// ------------------------------------------------------------- entity files
for (const { schema, tables, byTable } of model) {
  for (const table of tables) {
    const cols = byTable[table] ?? []
    const name = entityName(schema, table)
    const needed = new Map() // ownerSchema -> Set(PascalName)
    const lines = cols.map((c) => {
      let zod
      const qualified = `${c.udt_schema}.${c.udt_name}`
      if (c.data_type === 'USER-DEFINED' && enums[qualified]) {
        zod = enumName(c.udt_schema, c.udt_name)
        const set = needed.get(c.udt_schema) ?? new Set()
        set.add(zod)
        needed.set(c.udt_schema, set)
      } else if (c.data_type === 'ARRAY') {
        zod = `z.array(${TYPE_MAP[c.udt_name.replace(/^_/, '')] ?? 'z.unknown()'})`
      } else {
        zod = TYPE_MAP[c.data_type]
        if (!zod) {
          unmapped.add(`${c.data_type} (${schema}.${table}.${c.column_name})`)
          zod = 'z.unknown()'
        }
      }
      if (c.is_nullable === 'YES') zod += '.nullable()'
      return `  ${JSON.stringify(c.column_name)}: ${zod},`
    })

    const imports = [`import { z } from "zod/v4";`]
    for (const [owner, names] of [...needed.entries()].sort()) {
      const from = owner === schema ? './enums.js' : `../${owner}/enums.js`
      imports.push(`import { ${[...names].sort().join(', ')} } from "${from}";`)
    }

    const rawRegion =
      `${START}\n` +
      `${HEAD(`Postgres table: ${schema}.${table}`)}${imports.join('\n')}\n\n` +
      `export const ${name} = z.object({\n${lines.join('\n')}\n});\nexport type ${name} = z.infer<typeof ${name}>;\n` +
      `${END}`
    const region = await formatRegion(rawRegion)

    const rel = `${schema}/${table}.ts`
    const full = path.join(OUTDIR, rel)
    if (fs.existsSync(full)) {
      const current = fs.readFileSync(full, 'utf8')
      const a = current.indexOf(START)
      const b = current.indexOf(END)
      if (a === -1 || b === -1 || b < a) {
        console.error(`  ${rel}: no generated region - refusing to overwrite hand-written contract`)
        process.exitCode = 1
        continue
      }
      writeFile(rel, current.slice(0, a) + region + current.slice(b + END.length))
    } else {
      writeFile(rel, `${region}\n\n// Hand-written derivations go here: New, Patch, named reads.\n`)
    }
    written.push(rel)
  }

  // ------------------------------------------------------------- schema index
  const members = tables.map((t) => `export * from "./${t}.js";`)
  if (usedEnums.has(schema)) members.unshift(`export * from "./enums.js";`)
  writeFile(
    `${schema}/index.ts`,
    await formatFile(
      `${HEAD(`Every entity of the \`${schema}\` schema, one namespace each.`)}${members.join('\n')}\n`
    )
  )
  wholeFiles.push(`${schema}/index.ts`)
}

// An enum-owning schema with no tables of its own still needs its barrel.
for (const owner of usedEnums.keys()) {
  if (model.some((m) => m.schema === owner)) continue
  writeFile(
    `${owner}/index.ts`,
    await formatFile(
      `${HEAD(`Enum types of the \`${owner}\` schema.`)}export * from "./enums.js";\n`
    )
  )
  wholeFiles.push(`${owner}/index.ts`)
}

// --------------------------------------------------------------- schemas.ts
const schemaNames = [...new Set([...model.map((m) => m.schema), ...usedEnums.keys()])].sort()
writeFile(
  'schemas.ts',
  await formatFile(
    `${HEAD('Every database schema, one namespace each. src/index.ts re-exports this\n// beside the computed shapes no table backs.')}` +
      schemaNames.map((s) => `export * from "./${s}/index.js";`).join('\n') +
      '\n'
  )
)
wholeFiles.push('schemas.ts')

console.log(
  `wrote ${written.length} entity file(s) across ${schemaNames.length} schema(s), ${wholeFiles.length} generated barrel/enum file(s)`
)
if (unmapped.size) {
  console.log('unmapped types (fell back to z.unknown()):')
  for (const u of unmapped) console.log('  ' + u)
}
