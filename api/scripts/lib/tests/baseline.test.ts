import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseBaseline,
  coveredBy,
  splitStatements,
  isDdlOnly,
  dataStatements,
  supersededByGenesis,
  runsUnderBaseline,
  BASELINE_FROM,
  migrationNumber,
  baselineThrough,
  alwaysRunMigrations,
  migrationNames,
} from '../baseline.ts'

const names = [
  '000_genesis_schema.sql',
  '001_index_foreign_keys.sql',
  '002_core_leads_priority.sql',
  '015_restore_timestamp_precision.sql',
  '028_close_orders_copy_gaps.sql',
  '029_later_work.sql',
]
const files = names.map((name) => ({ name, checksum: name }))

test('a baseline range is read off the file', () => {
  assert.deepEqual(parseBaseline('-- baseline: 002-028\n-- more'), {
    from: '002',
    through: '028',
  })
})

test('a file without a marker declares no baseline', () => {
  assert.equal(parseBaseline('-- just a migration\nALTER TABLE x ADD COLUMN y int;'), null)
  assert.equal(parseBaseline('-- baseline: 028'), null)
})

test('the marker is only honoured as a leading comment', () => {
  assert.equal(parseBaseline("SELECT '-- baseline: 002-028';"), null)
})

test('the range covers what it should and nothing else', () => {
  const covered = coveredBy({ from: '002', through: '028' }, '000_genesis_schema.sql', files).map(
    (f) => f.name
  )
  assert.deepEqual(covered, [
    '002_core_leads_priority.sql',
    '015_restore_timestamp_precision.sql',
    '028_close_orders_copy_gaps.sql',
  ])
})

test('001 is not covered, because production still needs it', () => {
  const covered = coveredBy({ from: '002', through: '028' }, '000_genesis_schema.sql', files)
  assert.equal(
    covered.some((f) => f.name.startsWith('001')),
    false
  )
})

test('work after the baseline still runs', () => {
  const covered = coveredBy({ from: '002', through: '028' }, '000_genesis_schema.sql', files)
  assert.equal(
    covered.some((f) => f.name.startsWith('029')),
    false
  )
})

test('the baseline never covers itself', () => {
  const covered = coveredBy({ from: '000', through: '028' }, '000_genesis_schema.sql', files)
  assert.equal(
    covered.some((f) => f.name.startsWith('000')),
    false
  )
})

test('already-applied migrations are left alone', () => {
  const applied = new Set(names.filter((n) => !n.startsWith('000')))
  assert.deepEqual(
    coveredBy({ from: '002', through: '028' }, '000_genesis_schema.sql', files, applied),
    []
  )
})

test('the genesis migration declares a range that exists on disk', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'migrations')
  const genesis = fs.readFileSync(path.join(dir, '000_genesis_schema.sql'), 'utf8')
  const baseline = parseBaseline(genesis)
  assert.ok(baseline, '000_genesis_schema.sql has no baseline marker')
  assert.equal(baseline.from, '002', '001 indexes exchange and must stay outside the range')

  const onDisk = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const last = onDisk.at(-1)
  assert.ok(last, `no .sql files in ${dir} - the migrations directory did not resolve`)
  const highest = last.slice(0, 3)
  assert.ok(
    baseline.through <= highest,
    `genesis claims a baseline through ${baseline.through}, past the last migration on disk (${highest})`
  )
  assert.ok(
    onDisk.some((f) => f.startsWith(baseline.through)),
    `genesis baselines through ${baseline.through}, which is not a migration that exists`
  )
})

// ---------------------------------------------------------------------------
// A baseline stamps SHAPE, never ROWS (ruling 82, 2026-09-06). Stamping the
// nine backfills inside 002-049 is how a production-shaped rehearsal ended
// with an empty product catalogue.

test('statements split on semicolons outside strings, dollar quotes and comments', () => {
  assert.deepEqual(splitStatements('SELECT 1; SELECT 2;'), ['SELECT 1', 'SELECT 2'])
  assert.equal(splitStatements("SELECT 'a;b';").length, 1)
  assert.equal(splitStatements('DO $$ BEGIN a; b; END $$;').length, 1)
  assert.equal(splitStatements('-- a; b\nSELECT 1;').length, 1)
})

test('pure DDL is stampable and anything carrying rows is not', () => {
  assert.equal(isDdlOnly('CREATE TABLE a (b int);\nALTER TABLE a ADD c int;'), true)
  assert.equal(isDdlOnly('ALTER TABLE a ADD c int;\nINSERT INTO a VALUES (1);'), false)
  assert.equal(isDdlOnly("UPDATE orders.orders SET status = 'x';"), false)
  assert.equal(isDdlOnly('DELETE FROM orders.offers;'), false)
  assert.equal(dataStatements('CREATE TABLE a (b int);\nINSERT INTO a VALUES (1);').length, 1)
})

test('a verb nobody listed is treated as data, which is the safe direction', () => {
  assert.equal(isDdlOnly('WITH x AS (SELECT 1) INSERT INTO a SELECT * FROM x;'), false)
  assert.equal(isDdlOnly('MERGE INTO a USING b ON true WHEN MATCHED THEN DELETE;'), false)
})

test('a DO block is judged by its body, not by being a DO block', () => {
  assert.equal(
    isDdlOnly(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1) THEN CREATE TYPE t AS ENUM ('a'); END IF; END $$;"
    ),
    true
  )
  assert.equal(isDdlOnly('DO $$ BEGIN INSERT INTO a VALUES (1); END $$;'), false)
  assert.equal(isDdlOnly("DO $$ BEGIN EXECUTE 'anything'; END $$;"), false)
})

test('ON DELETE SET NULL is a referential action, not a statement', () => {
  assert.equal(
    isDdlOnly(
      'DO $$ BEGIN ALTER TABLE a ADD CONSTRAINT f FOREIGN KEY (b) REFERENCES c(id) ON DELETE SET NULL; END $$;'
    ),
    true
  )
  assert.equal(isDdlOnly('DO $$ BEGIN PERFORM 1 FROM a FOR UPDATE; END $$;'), true)
})

test('a verb inside a RAISE message or a comment is not a statement', () => {
  assert.equal(
    isDdlOnly("DO $$ BEGIN RAISE EXCEPTION 'refusing to INSERT anything'; END $$;"),
    true
  )
  assert.equal(isDdlOnly('DO $$ BEGIN -- INSERT INTO a\n  CREATE TABLE b (c int); END $$;'), true)
})

test('genesis creates no sequences and no triggers, so those never stamp', () => {
  assert.equal(isDdlOnly('CREATE SEQUENCE orders.purchase_number_seq;'), false)
  assert.equal(
    isDdlOnly("DO $$ BEGIN PERFORM setval('orders.sale_number_seq', 63, false); END $$;"),
    false
  )
  assert.equal(
    isDdlOnly('CREATE TRIGGER audit_stamp BEFORE INSERT ON a EXECUTE FUNCTION f();'),
    false
  )
  assert.equal(isDdlOnly('DROP TRIGGER IF EXISTS mirror ON auth.users;'), false)
})

test('both markers need a reason, and a bare one throws', () => {
  assert.equal(
    supersededByGenesis(
      '-- superseded-by-genesis: core.leads was dissolved by 013 and 029 rebuilds it'
    ),
    'core.leads was dissolved by 013 and 029 rebuilds it'
  )
  assert.equal(supersededByGenesis('-- an ordinary migration\nCREATE TABLE a (b int);'), null)
  assert.throws(
    () => supersededByGenesis('-- superseded-by-genesis: because'),
    /at least 20 characters/
  )

  assert.equal(
    runsUnderBaseline(
      '-- runs-even-under-a-baseline: 023 adds the column and runs, so only this drops it'
    ),
    '023 adds the column and runs, so only this drops it'
  )
  assert.equal(runsUnderBaseline('CREATE TABLE a (b int);'), null)
  assert.throws(
    () => runsUnderBaseline('-- runs-even-under-a-baseline: why'),
    /at least 20 characters/
  )
})

test('every marker on disk carries a reason the runner will accept', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'migrations')
  let marked = 0
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    if (supersededByGenesis(sql) !== null) marked += 1
    if (runsUnderBaseline(sql) !== null) marked += 1
  }
  assert.ok(marked >= 5, `expected the five declared markers, found ${marked}`)
})

test('a migration filename yields its sortable number, and 159a is 159', () => {
  assert.equal(migrationNumber('265_the_order_list.sql'), '265')
  assert.equal(migrationNumber('159a_the_columns.sql'), '159')
  assert.equal(migrationNumber('000_genesis_schema.sql'), '000')
  assert.equal(migrationNumber('readme.md'), null)
})

test('the baseline through is the newest applied migration', () => {
  assert.equal(
    baselineThrough(
      ['000_genesis_schema.sql', '001_index.sql', '002_a.sql', '159a_b.sql', '265_c.sql'],
      new Set()
    ),
    '265'
  )
})

test('a runs-even-under-a-baseline migration is left out of the range', () => {
  assert.equal(
    baselineThrough(['002_a.sql', '265_c.sql', '266_repair.sql'], new Set(['266_repair.sql'])),
    '265',
    'naming it would claim the runner stamps it, and the runner replays it'
  )
})

test('a ledger with nothing at or after the from has no through', () => {
  assert.equal(baselineThrough(['000_genesis_schema.sql', '001_index.sql'], new Set()), null)
  assert.equal(BASELINE_FROM, '002')
})

test('the repair migrations on disk are the ones the marker leaves out', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'migrations')
  const always = alwaysRunMigrations(dir)
  assert.ok(always.size >= 2, `expected the declared repairs, found ${always.size}`)
  for (const name of always) {
    assert.ok(
      runsUnderBaseline(fs.readFileSync(path.join(dir, name), 'utf8')) !== null,
      `${name} is listed as always-run but carries no marker`
    )
  }
})

test('the committed genesis marker names a migration that exists', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'migrations')
  const marker = parseBaseline(fs.readFileSync(path.join(dir, '000_genesis_schema.sql'), 'utf8'))
  assert.ok(marker, 'genesis carries no baseline marker')
  assert.equal(marker.from, BASELINE_FROM)
  const present = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .map(migrationNumber)
  assert.ok(
    present.includes(marker.through),
    `baseline through ${marker.through} names no migration file`
  )
})

test('a ledger row naming no file does not move the range', () => {
  assert.equal(
    baselineThrough(
      ['002_a.sql', '265_c.sql', '999_renumbered_away.sql'],
      new Set(),
      new Set(['002_a.sql', '265_c.sql'])
    ),
    '265',
    "dev's ledger holds a row for a file that was renumbered; it claims nothing"
  )
})

test('the migration names on disk are the ones the runner sorts', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'migrations')
  const names = migrationNames(dir)
  assert.ok(names.length >= 200, `expected the migration set, found ${names.length}`)
  assert.equal(names[0], '000_genesis_schema.sql')
  assert.deepEqual(names, [...names].sort())
})
