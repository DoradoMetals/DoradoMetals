export type Baseline = { from: string; through: string }

export type MigrationFile = { name: string }

export function parseBaseline(sql: string): Baseline | null {
  const m = sql.match(/^\s*--\s*baseline:\s*(\d+)-(\d+)/m)
  return m ? { from: m[1], through: m[2] } : null
}

export function coveredBy<T extends MigrationFile>(
  baseline: Baseline | null,
  self: string,
  files: readonly T[],
  applied: ReadonlySet<string> = new Set<string>()
): T[] {
  if (!baseline) return []
  const { from, through } = baseline
  return files.filter((f) => {
    if (f.name === self) return false
    if (applied.has(f.name)) return false
    const num = f.name.slice(0, from.length)
    return /^\d+$/.test(num) && num >= from && num <= through
  })
}

/**
 * `-- superseded-by-genesis: <why>` on a migration inside a baseline range
 * says the file's WORK, data included, is already in the shape genesis builds
 * or is re-derived by a later migration - so a from-nothing build should
 * record it as done rather than replay it against tables it no longer names.
 *
 * The four that carry it all pre-date `013_split_core_into_feature_schemas`
 * or `029_genesis_backfill`, and every one of them writes to a table genesis
 * does not create.
 *
 * A reason is mandatory and is checked here: a marker that says nothing is a
 * skipped migration nobody can audit. Returns the reason, or null.
 */
export function supersededByGenesis(sql: string): string | null {
  const m = sql.match(/^\s*--\s*superseded-by-genesis:\s*(.+)$/m)
  if (!m) return null
  const reason = m[1].trim()
  if (reason.length < 20) {
    throw new Error(
      `superseded-by-genesis needs a reason of at least 20 characters, got "${reason}"`
    )
  }
  return reason
}

/**
 * `-- runs-even-under-a-baseline: <why>` is the other direction: a migration
 * that LOOKS like pure DDL genesis reproduces, and is not, because it has to
 * undo something a migration that DOES run has just done. 131 is the case that
 * found this - 023 adds `products.bullion.stock` and runs (it carries an
 * UPDATE), 131 drops it and would have been stamped, so the rebuilt catalogue
 * kept two columns dev does not have.
 *
 * A reason is mandatory, for the same reason it is on the other marker.
 */
export function runsUnderBaseline(sql: string): string | null {
  const m = sql.match(/^\s*--\s*runs-even-under-a-baseline:\s*(.+)$/m)
  if (!m) return null
  const reason = m[1].trim()
  if (reason.length < 20) {
    throw new Error(
      `runs-even-under-a-baseline needs a reason of at least 20 characters, got "${reason}"`
    )
  }
  return reason
}

// --------------------------------------------------------------- statements
//
// Splitting a migration into statements, and asking whether it does anything
// but change SHAPE. The runner needs both: a baseline says "genesis already
// creates what these files create", which is true of their DDL and false of
// their data. Stamping a backfill is how production's product catalogue,
// metals, spot prices and rates came out empty in the UAT rehearsal (F7).

/** Split SQL into statements, ignoring semicolons inside strings, dollar
 *  quotes and comments. Comments are dropped; string and dollar-quoted bodies
 *  are kept verbatim. */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let cur = ''
  let i = 0

  while (i < sql.length) {
    const two = sql.slice(i, i + 2)

    if (two === '--') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? sql.length : nl
      continue
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i)
      i = end === -1 ? sql.length : end + 2
      continue
    }
    if (sql[i] === "'") {
      const end = sql.indexOf("'", i + 1)
      const stop = end === -1 ? sql.length : end + 1
      cur += sql.slice(i, stop)
      i = stop
      continue
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
    if (dollar) {
      const tag = dollar[0]
      const end = sql.indexOf(tag, i + tag.length)
      const stop = end === -1 ? sql.length : end + tag.length
      cur += sql.slice(i, stop)
      i = stop
      continue
    }
    if (sql[i] === ';') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      i++
      continue
    }
    cur += sql[i]
    i++
  }

  if (cur.trim()) out.push(cur.trim())
  return out
}

/**
 * The verbs that only ever change shape. Anything else - INSERT, UPDATE,
 * DELETE, SELECT, WITH, and DO, whose body cannot be read from here - makes
 * the file NOT ddl-only, which means the runner runs it.
 *
 * The list is an allowlist on purpose. A verb nobody thought of is treated as
 * data and runs, which is the safe direction: running a migration that turns
 * out to be a no-op costs a second, and skipping one that turns out to carry
 * rows costs the rows.
 */
export const DDL_VERBS = Object.freeze([
  'CREATE',
  'ALTER',
  'DROP',
  'COMMENT',
  'GRANT',
  'REVOKE',
  'SET',
  'RESET',
  'REINDEX',
  'CLUSTER',
  'ANALYZE',
  'SECURITY',
])

/** True when every statement in the file is pure DDL, so a baseline that
 *  covers it may stamp it instead of running it. */
export function isDdlOnly(sql: string): boolean {
  return dataStatements(sql).length === 0
}

/**
 * Verbs that write rows, plus EXECUTE, whose target cannot be read from here.
 * A DO block is anonymous plpgsql: it is DDL when its body holds none of these
 * and data the moment it holds one. Most of the DO blocks in these migrations
 * are `IF NOT EXISTS ... CREATE TYPE` guards, which is shape and nothing else.
 */
const WRITING = /\b(INSERT|UPDATE|DELETE|MERGE|COPY|EXECUTE|TRUNCATE)\b/i

/** Comments, string literals and the referential-action words removed, so a
 *  verb inside a RAISE message, a comment, or `ON DELETE SET NULL` is not
 *  mistaken for a statement. */
function bare(body: string): string {
  return body
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, ' ')
    .replace(/\bON\s+(DELETE|UPDATE)\b/gi, ' ')
    .replace(/\bFOR\s+(NO\s+KEY\s+)?UPDATE\b/gi, ' ')
}

/**
 * GENESIS CREATES NO SEQUENCES. `scripts/dump-schema.mjs` emits schemas,
 * enums, tables, columns, constraints, indexes, views and functions - and
 * nothing else - so a migration that creates or re-seeds a sequence is NOT
 * superseded by it, however pure its DDL looks. 079 builds
 * `orders.purchase_number_seq` / `orders.sale_number_seq` and 115 re-seeds
 * them; stamping those two left a rebuilt production unable to create an
 * order, which is the same symptom F5 had for a different reason.
 */
const SEQUENCE = /\bSEQUENCE\b|\bsetval\s*\(/i

/**
 * GENESIS CREATES NO TRIGGERS EITHER, and CLAUDE.md says so on purpose: 116's
 * `audit_stamp` runs AFTER the backfills, so that a backfill reproduces
 * exchange's own audit columns instead of stamping itself. The generator emits
 * none, so a migration that creates or drops one is not superseded - stamping
 * 116 left a rebuilt production with no audit trigger on 26 tables, and
 * stamping 133 left the two retired auth mirrors alive.
 */
const TRIGGER = /\bTRIGGER\b/i

function writesRows(stmt: string): boolean {
  const first = /^[A-Za-z]+/.exec(stmt)?.[0]?.toUpperCase()
  if (!first) return true
  const body = bare(stmt)
  if (SEQUENCE.test(body) || TRIGGER.test(body)) return true
  if (first === 'DO') return WRITING.test(body.slice(2))
  return !DDL_VERBS.includes(first)
}

/** The statements that make a file more than DDL, for the runner to print. */
export function dataStatements(sql: string): string[] {
  return splitStatements(sql).filter(writesRows)
}
