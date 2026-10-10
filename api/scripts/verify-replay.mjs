import '#env'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { NATIVE_SCHEMAS as SCHEMAS } from './lib/schemas.ts'
import { parseBaseline } from './lib/baseline.ts'

/**
 * THE REPLAY. Genesis, then every migration the runner still runs after it,
 * on a scratch database - and the result compared with dev.
 *
 * `verify:genesis` asks one question: does `000_genesis_schema.sql` build what
 * dev is? It builds the file into renamed schemas and compares them column by
 * column. What it never does is REPLAY: the migrations after the baseline are
 * not applied in that scratch, so a migration that cannot run on top of the
 * shape genesis holds is invisible to it. That is the whole of why the October
 * production rehearsal aborted at 169 with "cannot drop columns from view"
 * while the gate was green - 169 recreates `refining.order_money` with six
 * columns, 263 had given the view eight, genesis held the eight, and nothing
 * ever tried putting 169 on top of genesis.
 *
 * This is that attempt, automated, and it is the production chain minus the
 * rows: build an empty `exchange` so the backfills have something to select
 * from, hand the real `scripts/migrate.mjs` a database that holds nothing
 * else, and let it do exactly what it would do on production day - baseline,
 * stamp, run. Then compare every schema against dev, and run the whole thing
 * again to prove the second run applies nothing.
 *
 * exchange is cloned WITH ITS ROWS - 39 tables and about three thousand rows,
 * a second over the wire. Structure alone was tried first and 047 aborted on
 * it: a seed that reads its organization out of exchange inserts a NULL into a
 * NOT NULL column when exchange is empty. A backfill chain needs something to
 * backfill, and anything less is a different chain from the one production day
 * runs.
 *
 * What is compared afterwards is SHAPE. `verify:backfill` is the half that
 * compares the rows and it reads dev directly; what this one owns is the
 * question "does the chain apply at all, and does it end where genesis says".
 *
 * The scratch database is created on the LOCAL cluster `TEST_DATABASE_URL`
 * names, never on the database being compared against, and its name must
 * start with `uat_replay`. Nothing else is ever dropped.
 */

const PREFIX = 'uat_replay'
const id = (s) => `"${s.replace(/"/g, '""')}"`
const KEEP = process.argv.includes('--keep')
const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'migrations')

let failures = 0
const note = (msg) => {
  failures++
  console.log(`  DIFF  ${msg}`)
}
const die = (msg) => {
  console.error(msg)
  process.exit(1)
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return ''
  }
}
const isLoopback = (url) => ['127.0.0.1', '::1', 'localhost'].includes(hostOf(url))
const nameOf = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))

const reference = process.env.DATABASE_URL
if (!reference) die('DATABASE_URL is not set; there is nothing to compare the replay against.')

const local = process.env.TEST_DATABASE_URL
if (!local || !isLoopback(local)) {
  die(
    `verify:replay builds a scratch database, so it needs a LOCAL cluster.\n` +
      `TEST_DATABASE_URL is ${local ? `remote (${hostOf(local)})` : 'not set'}.\n\n` +
      `Point it at the local Postgres in api/.env - see docs/waves/local-postgres.md.`
  )
}

const scratch = process.env.REPLAY_DATABASE ?? PREFIX
if (!scratch.startsWith(PREFIX)) {
  die(`refusing: a replay database must be named "${PREFIX}..."; got "${scratch}".`)
}

const scratchUrl = (() => {
  const u = new URL(local)
  u.pathname = `/${scratch}`
  return u.toString()
})()
const adminUrl = (() => {
  const u = new URL(local)
  u.pathname = '/postgres'
  return u.toString()
})()

if (nameOf(reference) === scratch && hostOf(reference) === hostOf(local)) {
  die(`refusing: the reference database and the scratch database are both "${scratch}".`)
}

const connect = async (url) => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  return c
}

// --------------------------------------------------------------- the scratch

const admin = await connect(adminUrl)
await admin.query(`DROP DATABASE IF EXISTS ${id(scratch)} WITH (FORCE)`)
await admin.query(`CREATE DATABASE ${id(scratch)}`)
console.log(`scratch database ${scratch} created on ${hostOf(local)}`)

const ref = await connect(reference)

/**
 * exchange, copied. Every backfill in the chain selects from it - 029 from
 * nearly all of it, 161 from exchange.scrap, 172 from exchange.addresses, 183
 * from exchange.purchase_orders - so 42P01 or an empty source would abort the
 * chain for a reason that has nothing to do with what is being tested.
 *
 * Columns, types, defaults, NOT NULLs, rows, keys and indexes. The keys are
 * not decoration: 108 writes its mirror with ON CONFLICT and a copy with no
 * unique index fails with "there is no unique or exclusion constraint matching
 * the ON CONFLICT specification". Foreign keys and triggers are left out -
 * nothing in the chain writes exchange except 107/108's auth mirrors, so there
 * is no referential order to respect and no trigger that can fire. Values
 * travel as text and are cast back on the way in, so a numrange, a jsonb and
 * an enum all round-trip without the client having to know them. The two enums
 * exchange columns name live in `public`, so both schemas' enums are cloned.
 *
 * `exchange.schema_migrations` is left out: it is the ledger, the runner
 * creates it itself with the primary key its ON CONFLICT needs, and a copy of
 * it without that key fails the first stamp.
 */
async function cloneExchangeStructure(target) {
  const { rows: enums } = await ref.query(
    `SELECT n.nspname AS schema, t.typname AS name,
            array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname IN ('exchange', 'public')
      GROUP BY 1, 2 ORDER BY 1, 2`
  )
  const { rows: tables } = await ref.query(
    `SELECT c.oid, c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'exchange' AND c.relkind = 'r'
        AND c.relname <> 'schema_migrations'
      ORDER BY c.relname`
  )
  if (!tables.length) {
    die(`the reference database has no tables in exchange; it is not the one to compare against.`)
  }

  // THE EXTENSIONS, BECAUSE GENESIS DOES NOT CREATE THEM. No migration says
  // CREATE EXTENSION anywhere, and genesis needs btree_gist for
  // `rates_no_overlap_qty` - an EXCLUDE constraint over a numrange. Production
  // and dev both already carry it, which is why nobody has met this; a
  // database built from literally nothing aborts on genesis itself with "data
  // type text has no default operator class for access method gist". The
  // scratch is given what the reference has, so the replay tests the chain
  // rather than the cluster.
  const { rows: extensions } = await ref.query(
    `SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY extname`
  )
  for (const e of extensions) {
    await target.query(`CREATE EXTENSION IF NOT EXISTS ${id(e.extname)}`)
  }

  await target.query('CREATE SCHEMA IF NOT EXISTS exchange')
  for (const e of enums) {
    const labels = e.labels.map((l) => `'${l.replace(/'/g, "''")}'`).join(', ')
    await target.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                         WHERE t.typname = '${e.name}' AND n.nspname = '${e.schema}') THEN
           CREATE TYPE ${e.schema}.${e.name} AS ENUM (${labels});
         END IF;
       END $$`
    )
  }
  // THE SEQUENCES TOO. 079 seeds orders.purchase_number_seq from
  // exchange.purchase_orders_order_number_seq, so a copy of exchange without
  // its sequences aborts the chain at 079 with "relation ... does not exist".
  // Their current values come across as well: 079 reads them.
  const { rows: seqs } = await ref.query(
    `SELECT c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'exchange' AND c.relkind = 'S'
      ORDER BY c.relname`
  )
  for (const q of seqs) {
    await target.query(`CREATE SEQUENCE IF NOT EXISTS exchange.${id(q.name)} AS bigint`)
    const { rows } = await ref.query(`SELECT last_value, is_called FROM exchange.${id(q.name)}`)
    await target.query(`SELECT setval('exchange.${q.name}', $1::bigint, $2::boolean)`, [
      rows[0].last_value,
      rows[0].is_called,
    ])
  }

  let copied = 0
  for (const t of tables) {
    const { rows: cols } = await ref.query(
      `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
              a.attnotnull AS not_null,
              pg_get_expr(d.adbin, d.adrelid) AS default_expr
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [t.oid]
    )
    await target.query(
      `CREATE TABLE IF NOT EXISTS exchange.${id(t.name)} (\n` +
        cols
          .map(
            (c) =>
              `  ${id(c.name)} ${c.type}` +
              (c.default_expr ? ` DEFAULT ${c.default_expr}` : '') +
              (c.not_null ? ' NOT NULL' : '')
          )
          .join(',\n') +
        `\n)`
    )

    const { rows } = await ref.query(
      `SELECT ${cols.map((c) => `${id(c.name)}::text`).join(', ')} FROM exchange.${id(t.name)}`
    )
    if (!rows.length) continue
    const names = cols.map((c) => id(c.name)).join(', ')
    const chunk = Math.max(1, Math.floor(50000 / cols.length))
    for (let i = 0; i < rows.length; i += chunk) {
      const batch = rows.slice(i, i + chunk)
      const params = []
      const values = batch
        .map(
          (row) =>
            `(${cols
              .map((c) => {
                params.push(row[c.name])
                return `$${params.length}::${c.type}`
              })
              .join(', ')})`
        )
        .join(', ')
      await target.query(`INSERT INTO exchange.${id(t.name)} (${names}) VALUES ${values}`, params)
    }
    copied += rows.length
  }

  // Keys and indexes AFTER the rows, so a copy is never rejected by a
  // constraint the source satisfied in some order this loop does not know.
  // Foreign keys are excluded by contype <> 'f'.
  const { rows: constraints } = await ref.query(
    `SELECT c.relname AS table, con.conname AS name, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'exchange' AND con.contype <> 'f'
        AND c.relname <> 'schema_migrations'
      ORDER BY (con.contype = 'c'), c.relname, con.conname`
  )
  for (const c of constraints) {
    await target.query(`ALTER TABLE exchange.${id(c.table)} ADD CONSTRAINT ${id(c.name)} ${c.def}`)
  }

  const { rows: indexes } = await ref.query(
    `SELECT pg_get_indexdef(i.indexrelid) AS def
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'exchange' AND c.relname <> 'schema_migrations'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid)`
  )
  for (const x of indexes) await target.query(x.def)

  return {
    tables: tables.length,
    rows: copied,
    sequences: seqs.length,
    keys: constraints.length + indexes.length,
  }
}

const built = await (async () => {
  const target = await connect(scratchUrl)
  try {
    return await cloneExchangeStructure(target)
  } finally {
    await target.end()
  }
})()
console.log(
  `cloned ${built.tables} exchange table(s), ${built.sequences} sequence(s), ` +
    `${built.keys} key(s) and index(es) and ${built.rows} row(s)`
)

// --------------------------------------------------------------- the replay

function migrate(label) {
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, 'migrate.mjs')], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      USE_TEST_DB: '',
      DATABASE_URL: scratchUrl,
      MIGRATE_ALLOW_DB: scratch,
    },
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) {
    const tail = out.trimEnd().split('\n').slice(-12).join('\n')
    note(`the ${label} replay FAILED:\n${tail.replace(/^/gm, '    ')}`)
  }
  return { ok: r.status === 0, out }
}

const baseline = parseBaseline(
  fs.readFileSync(path.join(MIGRATIONS_DIR, '000_genesis_schema.sql'), 'utf8')
)
console.log(
  `replaying genesis (baseline ${baseline ? `${baseline.from}-${baseline.through}` : 'none'}) ` +
    `and every migration the runner still runs after it...`
)

const first = migrate('first')
const applied = Number(/applied (\d+) migration/.exec(first.out)?.[1] ?? 0)
const ran = [...first.out.matchAll(/^applying (\S+)/gm)].map((m) => m[1])
if (first.ok) console.log(`applied ${applied} migration(s), of which ${ran.length} actually ran`)

const MIGRATION_FLOOR = Number(process.env.REPLAY_MIGRATION_FLOOR ?? 100)
if (first.ok && applied < MIGRATION_FLOOR) {
  note(
    `the replay applied ${applied} migration(s), expected at least ` +
      `${MIGRATION_FLOOR}. A replay that applies nothing proves nothing.`
  )
}

if (first.ok) {
  const second = migrate('second')
  if (second.ok && !/nothing to apply/.test(second.out)) {
    const again = [...second.out.matchAll(/^applying (\S+)/gm)].map((m) => m[1])
    note(`the second run is not a no-op; it applied ${again.length}: ${again.join(', ')}`)
  } else if (second.ok) {
    console.log('a second run applies nothing')
  }
}

// --------------------------------------------------------------- the compare

const replayed = first.ok ? await connect(scratchUrl) : null

const PROJECTIONS = {
  relation: `SELECT n.nspname || '.' || c.relname || '  ' ||
                    CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view'
                                   WHEN 'S' THEN 'sequence' END AS k
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = ANY($1) AND c.relkind IN ('r', 'v', 'S')`,

  column: `SELECT n.nspname || '.' || c.relname || '.' || a.attname || '  #' || a.attnum ||
                  '  ' || format_type(a.atttypid, a.atttypmod) ||
                  CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
                  CASE WHEN a.attidentity <> '' THEN ' IDENTITY(' || a.attidentity::text || ')'
                       ELSE '' END ||
                  CASE WHEN a.attgenerated <> '' THEN ' GENERATED' ELSE '' END ||
                  COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') AS k
             FROM pg_attribute a
             JOIN pg_class c ON c.oid = a.attrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE n.nspname = ANY($1) AND a.attnum > 0 AND NOT a.attisdropped
              AND c.relkind IN ('r', 'v')`,

  constraint: `SELECT n.nspname || '.' || c.relname || '  ' || con.conname || '  ' ||
                      pg_get_constraintdef(con.oid) AS k
                 FROM pg_constraint con
                 JOIN pg_class c ON c.oid = con.conrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = ANY($1)`,

  index: `SELECT pg_get_indexdef(i.indexrelid) AS k
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = ANY($1)`,

  type: `SELECT schema || '.' || name || '  ' || labels AS k
           FROM (SELECT n.nspname AS schema, t.typname AS name,
                        array_agg(e.enumlabel::text ORDER BY e.enumsortorder)::text AS labels
                   FROM pg_type t
                   JOIN pg_namespace n ON n.oid = t.typnamespace
                   JOIN pg_enum e ON e.enumtypid = t.oid
                  WHERE n.nspname = ANY($1)
                  GROUP BY 1, 2) e`,

  function: `SELECT pg_get_functiondef(p.oid) AS k
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = ANY($1)`,

  trigger: `SELECT pg_get_triggerdef(g.oid) AS k
              FROM pg_trigger g
              JOIN pg_class c ON c.oid = g.tgrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = ANY($1) AND NOT g.tgisinternal`,

  // The one that catches 169's class. A view's column list is only visible in
  // its definition and in the column projection above; its BODY is only here.
  view: `SELECT n.nspname || '.' || c.relname || '\n' || pg_get_viewdef(c.oid, true) AS k
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ANY($1) AND c.relkind = 'v'`,
}

const RELATION_FLOOR = Number(process.env.REPLAY_RELATION_FLOOR ?? 100)

if (replayed) {
  let compared = 0
  for (const [kind, sql] of Object.entries(PROJECTIONS)) {
    const side = async (c) => (await c.query(sql, [SCHEMAS])).rows.map((r) => r.k).sort()
    const [want, got] = [await side(ref), await side(replayed)]
    if (kind === 'relation') compared = want.length
    const inGot = new Set(got)
    const inWant = new Set(want)
    for (const x of want.filter((v) => !inGot.has(v))) note(`the replay is missing ${kind}: ${x}`)
    for (const x of got.filter((v) => !inWant.has(v))) note(`the replay has an extra ${kind}: ${x}`)
  }
  console.log(`compared ${compared} relation(s) across ${SCHEMAS.length} schemas`)
  if (compared < RELATION_FLOOR) {
    note(
      `only ${compared} relation(s) were compared, expected at least ` +
        `${RELATION_FLOOR}. The walk is broken, not the drift gone.`
    )
  }
  await replayed.end()
}

await ref.end()

if (KEEP) {
  console.log(`\nkeeping ${scratch} (--keep)`)
} else {
  await admin.query(`DROP DATABASE IF EXISTS ${id(scratch)} WITH (FORCE)`)
}
await admin.end()

console.log(
  failures
    ? `\n${failures} difference(s) - the chain does not replay onto genesis cleanly`
    : `\nthe chain replays onto genesis and ends where dev is`
)

process.exit(failures ? 1 : 0)
