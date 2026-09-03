// Does the test suite leave anything behind in the database it runs against?
//
// WHY THIS EXISTS. features/shipping/operations/tracking.test.js opened its own
// withTransaction and asserted through that client - but the service it tests
// opens its own transaction, on its own connection from the pool, so the
// service's writes COMMITTED while the test's rolled back. It deleted the real
// FedEx history of five dev shipments and left two fabricated events on each:
// the exact bug that file was written to prevent, committed by the test for it.
//
// Every assertion in that file passed anyway, because a test reads its own
// writes whether or not they are contained. Nothing could have caught it except
// looking at the database from outside afterwards. That is what this does.
//
// CONTENT, NOT COUNTS. A row count would have caught that particular case - 17
// events became 2 - and would miss the other half of the same bug, which
// overwrote shipping_status and estimated_delivery in place. So each table is
// reduced to an md5 over its rows, ordered by their own text so the result does
// not depend on physical order.
//
// Read-only except for --self-test, which writes inside a transaction it rolls
// back. It never writes to production and refuses to run against it.
//
//   node scripts/audit-test-leaks.mjs              snapshot, run the suite, compare
//   node scripts/audit-test-leaks.mjs --self-test  prove the detector can see a change
//
// Exits non-zero if any table changed, naming it.
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import path from "node:path";
import { spawn } from "node:child_process";

import { suiteInvocation } from "./lib/suite-invocation.ts";

// The suite must be spawned from api/, not from wherever this was invoked -
// `node --test` discovers its files relative to cwd, and a run started from the
// repo root would silently test a different (smaller) set.
const SUITE_CWD = path.resolve(import.meta.dirname, "..");

const SELF_TEST = process.argv.includes("--self-test");

// *** THIS AUDIT FINGERPRINTED THE WRONG DATABASE (found and fixed 2026-09-03).
// *** A bare `import "#env"` at the top of this file resolved `DATABASE_URL`
// to dev, while `pnpm test` writes `test_<branch>` on the local cluster - two
// different databases, and the second one is the only one the suite this
// audit exists to police ever touches. A clean diff meant nothing; it could
// not have caught a leak if one happened.
//
// WHY THE BARE IMPORT WAS WRONG: `pnpm test` is a two-segment `&&` chain and
// BOTH segments set `USE_TEST_DB=1` - `env.ts` only derives the per-branch
// test database and overrides `DATABASE_URL` with it when that variable is
// ALREADY set at the moment `#env` runs. `USE_TEST_DB` lives only on the
// "test" script's own segments, never in api/.env, so a static `import
// "#env"` here - which runs before any of this file's own code, ESM always
// executes a module's imports first - saw it unset and left `DATABASE_URL`
// at dev's value.
//
// THE FIX READS suite-invocation's OWN ANSWER rather than re-deriving the
// per-branch logic a second time - the same "read the definition, do not
// reproduce it" rule this file already follows for how the suite is RUN
// (see runSuite() below). `invocation.env` is the LAST `&&` segment's env
// assignments (NODE_ENV, TZ, USE_TEST_DB) - the exact segment that runs the
// tests - applied to THIS process before `#env` is imported, so `#env`
// resolves `DATABASE_URL` exactly as the spawned suite's own `#env` import
// will, today's name or a future one, without this file ever naming it.
// A dynamic `import()` is what makes the ordering possible at all: a static
// `import "#env"` cannot be preceded by this file's own code no matter where
// it is written in the source.
const invocation = suiteInvocation();
for (const [key, value] of Object.entries(invocation.env)) {
  process.env[key] = value;
}
await import("#env");

// The suite runs against DATABASE_URL - which #env has now resolved exactly
// as the spawned suite will - so that is what has to be measured, and it must
// not be production. One Postgres instance holds all of them.
//
// AN ALLOWLIST, NOT A DENYLIST, and the first version of this was the wrong one.
// It refused when the name matched production and allowed everything else, so
// the moment the databases are renamed - prod / dev / test, which is the plan -
// it would have stopped recognising production and silently permitted a full
// test run against it. A check that cannot identify its subject has to refuse,
// not shrug.
//
// So: name the databases it is safe to run against, and refuse anything else,
// including a name nobody has taught it yet. `test_<branch>` joined "dev" and
// "test" once the per-branch database landed (FOLLOWUPS D214 item 9) - matched
// by the same sanitiser env.ts uses to build the name (lowercase, `[a-z0-9_]`
// only), not a loose "starts with test" prefix a stray database could satisfy
// by accident.
const SAFE_EXACT = new Set(["dev", "test"]);
const isSafeName = (name: string): boolean =>
  SAFE_EXACT.has(name) || /^test_[a-z0-9_]+$/.test(name);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const dbName = (() => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
})();

if (!isSafeName(dbName)) {
  console.error(
    `DATABASE_URL points at "${dbName || "a database this script cannot identify"}".\n` +
      `This script runs the whole test suite, so it only runs against "dev",\n` +
      `"test", or a "test_<branch>" database. If a database was renamed, fix\n` +
      `isSafeName in this file - do not widen the check to "anything that is\n` +
      `not production".`
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

// EVERY non-system schema in the database being fingerprinted, discovered
// fresh each run rather than hand-listed.
//
// THIS AUDIT WAS EXCHANGE-ONLY UNTIL 2026-08-29, and by then that was the wrong
// half of the database. Orders pivoted their reads to `orders.*` in a12b76ed,
// so the authoritative rows for a migrated feature live in the new schemas -
// and a test leaking a committed row into `orders.orders` was invisible here
// while the same leak into `exchange.purchase_orders` would have been caught.
// A HAND-LISTED set of eighteen schema names fixed that but reintroduced the
// same class of gap one level up: a NINETEENTH schema would leak silently
// until someone remembered to add its name here. So this now asks the
// database what schemas exist, same as `pg_dump`/`psql` would, instead of
// repeating a list that can go stale (2026-09-03).
//
// `pg_%` (pg_catalog, pg_toast, pg_temp_N, ...) are Postgres internals, never
// application data; `information_schema` is the SQL-standard catalog view,
// same reasoning. `public` is Postgres's OWN default schema, not one this app
// created - confirmed empty on dev and on every local test database, because
// every table this app owns lives in a named schema on purpose - and
// including it would make the "blind schema" guard below refuse FOREVER on a
// schema that is empty by design, which is indistinguishable at the SQL level
// from the permissions gap that guard actually exists to catch.
//
// Found by the failure it caused rather than by review: purchase-orders'
// "reads do not write" asserts that a count of `orders.orders` is unchanged
// across a read, and it failed 64 != 63 in a full run while holding the ORDERS
// advisory lock. A count only moves for another connection when something
// COMMITS, and an advisory lock does not serialise a service that opens its own
// pool connection - which is the exact leak shape this audit exists to find.
//
// Same lesson as D95 and D99: a detector that only looks at one shape reports
// clean on every other one.
const RESERVED_SCHEMA = new Set(["information_schema", "public"]);

// Either end of the pool will do - the census runs on the pool itself and the
// self-check runs on a pinned client - so the parameter is the union rather
// than whichever one the first call site happened to pass.
type Queryable = Pool | PoolClient;

/** name -> row count and content hash. */
type Fingerprint = Record<string, { n: number; sum: string }>;

async function schemas(client: Queryable): Promise<string[]> {
  const { rows } = await client.query<{ nspname: string }>(
    `SELECT nspname FROM pg_namespace
      WHERE nspname !~ '^pg_' AND nspname <> ALL($1)
      ORDER BY nspname`,
    [[...RESERVED_SCHEMA]]
  );
  return rows.map((r) => r.nspname);
}

async function tables(client: Queryable, schemaNames: string[]): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT n.nspname AS schema, c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($1) AND c.relkind = 'r'
      ORDER BY n.nspname, c.relname`,
    [schemaNames]
  );
  // A schema can contribute nothing for two very different reasons, and only
  // one of them is fine. ABSENT is fine, and no longer representable here at
  // all - `schemas()` above only ever returns names pg_namespace already has.
  // PRESENT BUT CONTRIBUTING NOTHING is not: that is either a permissions gap
  // or a schema this audit cannot see, and it reports identically to "nothing
  // leaked". audit:non-finite learned this the hard way against production's
  // `core`, where the read-only role had no USAGE and nine tables vanished
  // from the measurement without a word.
  const seen = new Set<string>(rows.map((r) => r.schema));
  const blind = schemaNames.filter((s) => !seen.has(s));
  if (blind.length) {
    console.error(`REFUSING TO REPORT: ${blind.join(", ")} exist(s) but yielded no readable tables.`);
    console.error("A schema that contributes nothing looks identical to one that leaked nothing.");
    process.exit(1);
  }
  return rows.map((r) => `${r.schema}.${r.name}`);
}

// md5 over every row's own text, ordered by that text. Independent of physical
// order, so a VACUUM or a rewrite does not read as a change - and sensitive to
// any column of any row, which is the point.
async function fingerprint(client: Queryable, names: string[]): Promise<Fingerprint> {
  const out: Fingerprint = {};
  for (const name of names) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n,
              md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS sum
         FROM ${name.split(".")[0]}."${name.split(".").slice(1).join(".")}" t`
    );
    out[name] = { n: rows[0].n, sum: rows[0].sum };
  }
  return out;
}

type Change = { table: string; message: string };

// NO ACCEPTED LIST HERE, ON PURPOSE. `domain/users/tests/credit-delta.test.ts`
// commits for real to prove adjustDoradoCredit's row lock and restores every
// balance it moves, but cannot restore the `payments.ledger` row each
// movement also writes - an append-only table, by that file's own header. It
// is real, reproducible (measured +7 rows on two separate real runs), and
// this audit's whole purpose is finding exactly this shape of commit - a
// test writing outside a transaction that rolls back. Whether growing
// `payments.ledger` forever in every developer's local database is
// acceptable is Jacob's call, not this script's; hiding it behind an
// ACCEPTED entry would make the audit certify the thing it exists to catch.
// It is reported as a plain violation below like any other.
function compare(before: Fingerprint, after: Fingerprint): Change[] {
  const changed: Change[] = [];
  for (const name of Object.keys(before)) {
    const a = before[name];
    const b = after[name];
    if (!b) {
      changed.push({ table: name, message: `${name} disappeared` });
    } else if (a.n !== b.n) {
      const delta = b.n - a.n;
      changed.push({
        table: name,
        message: `${name}: ${a.n} rows -> ${b.n} rows (${delta >= 0 ? "+" : ""}${delta})`,
      });
    } else if (a.sum !== b.sum) {
      changed.push({ table: name, message: `${name}: ${a.n} rows, contents changed in place` });
    }
  }
  for (const name of Object.keys(after)) {
    if (!before[name]) changed.push({ table: name, message: `${name} appeared` });
  }
  return changed;
}

// PROVES THE DETECTOR CAN SEE A CHANGE, without leaving one behind.
//
// A snapshot that always matches is indistinguishable from a snapshot that
// cannot tell. So this updates one row and one row only, checks the
// fingerprint moves, rolls back, and checks it moves back. An UPDATE rather
// than an INSERT deliberately: the row count does not change, so only the
// content hash can notice, which is the half a count-based check would miss.
async function selfTest() {
  const client = await pool.connect();
  try {
    const schemaNames = await schemas(client);
    const names = await tables(client, schemaNames);
    const start = await fingerprint(client, names);

    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, shipping_status FROM exchange.shipments ORDER BY id LIMIT 1`
    );
    if (!rows.length) throw new Error(`"${dbName}" has no shipment to test against`);

    await client.query(
      `UPDATE exchange.shipments SET shipping_status = shipping_status || '-probe' WHERE id = $1`,
      [rows[0].id]
    );
    const dirty = await fingerprint(client, names);
    const seen = compare(start, dirty);

    await client.query("ROLLBACK");
    const clean = await fingerprint(client, names);
    const after = compare(start, clean);

    if (seen.length !== 1 || !seen[0].message.includes("contents changed in place")) {
      console.error("FAILED: an in-place update was not detected");
      console.error("  saw:", seen);
      process.exitCode = 1;
      return;
    }
    if (after.length !== 0) {
      console.error("FAILED: the probe was not rolled back");
      console.error("  left:", after);
      process.exitCode = 1;
      return;
    }
    console.log("self-test passed");
    console.log(`  an in-place UPDATE to one row of exchange.shipments was detected`);
    console.log(`  the rollback restored the fingerprint exactly`);
    console.log(`  ${names.length} tables fingerprinted, nothing written`);
  } finally {
    client.release();
  }
}

// THE SAME ENVIRONMENT `pnpm test` USES - READ FROM package.json, NOT RETYPED.
//
// This spawned `node --test` with TZ alone, while package.json's test script is
// `TZ=UTC NODE_ENV=test node --test`. So the audit that exists to prove the
// suite touches nothing live was running that suite with ONE OF THE TWO LEGS
// of `isTestRun()` missing - and `isTestRun()` is what stops a test reaching
// the mail transport, the FedEx client and the Stripe client. The `--test`
// execArgv leg still held, which is why nothing ever escaped, but a guard
// running on half its legs is not the guard the comment describes.
//
// THE FIX IS NOT "REMEMBER NODE_ENV" (D123). It is to stop assembling an
// invocation at all: scripts/lib/suite-invocation.mjs reads
// `package.json scripts.test` and refuses if it cannot understand it, so this
// script cannot drift from the suite again without something throwing. The tell
// that found the original was the audit DISAGREEING WITH THE SUITE IT AUDITS -
// 915/916 against 916/916 - and the disagreement is now impossible rather than
// merely noticeable.
function runSuite() {
  // Reuses the module-level `invocation` computed above (the same object
  // whose env was already applied to this process) rather than re-reading
  // package.json a second time - so the database this audit fingerprinted
  // and the suite it runs are guaranteed to agree on which invocation is
  // "the" invocation, not merely on two separate reads of the same file.
  console.log(
    `running the suite as ${invocation.source} defines it: ${invocation.shellCommand}`
  );
  // SHELL, NOT argv - the script body is a \`&&\` CHAIN (preflight, then the
  // real suite) since the network guard's preload landed, and spawning
  // invocation.command/args directly runs only the first token's literal
  // argv with \`&&\` and everything after it as inert extra arguments to
  // node - which is exactly how this audit went vacuous (see suite-
  // invocation.ts's header). A shell is what actually understands \`&&\`,
  // and it propagates the LAST command's exit code, which is what \`code\`
  // below must reflect for the "suite exited N" line to mean anything.
  return new Promise((resolve) => {
    const child = spawn(invocation.shellCommand, {
      cwd: SUITE_CWD,
      env: { ...process.env },
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
    });
    child.on("close", (code) => resolve(code));
  });
}

async function audit() {
  const schemaNames = await schemas(pool);
  const names = await tables(pool, schemaNames);
  console.log(
    `fingerprinting ${names.length} tables across ${schemaNames.length} schemas ` +
      `in "${dbName}": ${schemaNames.join(", ")}`
  );
  const before = await fingerprint(pool, names);

  console.log("running the suite\n");
  const code = await runSuite();
  console.log(`\nsuite exited ${code}`);

  const after = await fingerprint(pool, names);
  const changed = compare(before, after);

  if (!changed.length) {
    console.log(`\nno table changed - the suite leaves nothing behind in "${dbName}"`);
  } else {
    console.error(`\n${changed.length} table(s) changed:\n`);
    for (const c of changed) console.error(`  ${c.message}`);
    console.error(
      `\nA test is writing outside its own transaction. If it calls a service,` +
        `\nthe service opens its OWN transaction on its OWN connection and commits -` +
        `\nuse shared/testing/pinned-pool.js, which pins both to one that is rolled back.`
    );
    process.exitCode = 1;
  }

  // A red suite is its own failure and should not be hidden by a clean diff.
  if (code !== 0) process.exitCode = 1;
}

try {
  await (SELF_TEST ? selfTest() : audit());
} finally {
  await pool.end();
}
