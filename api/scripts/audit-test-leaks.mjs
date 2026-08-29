// Does the test suite leave anything behind in dev?
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
import "#env";
import pg from "pg";
import path from "node:path";
import { spawn } from "node:child_process";

import { suiteInvocation } from "./lib/suite-invocation.mjs";

// The suite must be spawned from api/, not from wherever this was invoked -
// `node --test` discovers its files relative to cwd, and a run started from the
// repo root would silently test a different (smaller) set.
const SUITE_CWD = path.resolve(import.meta.dirname, "..");

const SELF_TEST = process.argv.includes("--self-test");

// The suite runs against DATABASE_URL, so that is what has to be measured - and
// it must not be production. One Postgres instance holds all of them.
//
// AN ALLOWLIST, NOT A DENYLIST, and the first version of this was the wrong one.
// It refused when the name matched production and allowed everything else, so
// the moment the databases are renamed - prod / dev / test, which is the plan -
// it would have stopped recognising production and silently permitted a full
// test run against it. A check that cannot identify its subject has to refuse,
// not shrug.
//
// So: name the databases it is safe to run against, and refuse anything else,
// including a name nobody has taught it yet.
const SAFE = new Set(["dev", "test"]);

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

if (!SAFE.has(dbName)) {
  console.error(
    `DATABASE_URL points at "${dbName || "a database this script cannot identify"}".\n` +
      `This script runs the whole test suite, so it only runs against a database\n` +
      `named one of: ${[...SAFE].join(", ")}.\n` +
      `If a database was renamed, add the new name to SAFE in this file - do not\n` +
      `widen the check to "anything that is not production".`
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

// EVERY schema the app writes, not just `exchange`.
//
// THIS AUDIT WAS EXCHANGE-ONLY UNTIL 2026-08-29, and by then that was the wrong
// half of the database. Orders pivoted their reads to `orders.*` in a12b76ed,
// so the authoritative rows for a migrated feature live in the new schemas -
// and a test leaking a committed row into `orders.orders` was invisible here
// while the same leak into `exchange.purchase_orders` would have been caught.
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
const SCHEMAS = [
  "exchange",
  "orders", "payments", "fulfillments", "shipping", "refiners", "tax",
  "places", "auth", "products", "organizations", "metals", "spots",
  "media", "leads", "rates", "reviews", "checkout", "auctions",
];

async function tables(client) {
  const { rows } = await client.query(
    `SELECT n.nspname AS schema, c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($1) AND c.relkind = 'r'
      ORDER BY n.nspname, c.relname`,
    [SCHEMAS]
  );
  // A schema can contribute nothing for two very different reasons, and only
  // one of them is fine. ABSENT is fine - `auctions` has no tables on dev.
  // PRESENT BUT CONTRIBUTING NOTHING is not: that is either a permissions gap
  // or a schema this audit cannot see, and it reports identically to "nothing
  // leaked". audit:non-finite learned this the hard way against production's
  // `core`, where the read-only role had no USAGE and nine tables vanished
  // from the measurement without a word.
  const { rows: present } = await client.query(
    `SELECT nspname FROM pg_namespace WHERE nspname = ANY($1)`, [SCHEMAS]
  );
  const existing = new Set(present.map((r) => r.nspname));
  const seen = new Set(rows.map((r) => r.schema));
  const blind = [...existing].filter((s) => !seen.has(s));
  if (blind.length) {
    console.error(`REFUSING TO REPORT: ${blind.join(", ")} exist(s) but yielded no readable tables.`);
    console.error("A schema that contributes nothing looks identical to one that leaked nothing.");
    process.exit(1);
  }
  const absent = SCHEMAS.filter((s) => !existing.has(s));
  if (absent.length) console.log(`(not present in this database, skipped: ${absent.join(", ")})`);
  return rows.map((r) => `${r.schema}.${r.name}`);
}

// md5 over every row's own text, ordered by that text. Independent of physical
// order, so a VACUUM or a rewrite does not read as a change - and sensitive to
// any column of any row, which is the point.
async function fingerprint(client, names) {
  const out = {};
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

function compare(before, after) {
  const changed = [];
  for (const name of Object.keys(before)) {
    const a = before[name];
    const b = after[name];
    if (!b) {
      changed.push(`${name} disappeared`);
    } else if (a.n !== b.n) {
      changed.push(`${name}: ${a.n} rows -> ${b.n} rows (${b.n - a.n >= 0 ? "+" : ""}${b.n - a.n})`);
    } else if (a.sum !== b.sum) {
      changed.push(`${name}: ${a.n} rows, contents changed in place`);
    }
  }
  for (const name of Object.keys(after)) {
    if (!before[name]) changed.push(`${name} appeared`);
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
    const names = await tables(client);
    const start = await fingerprint(client, names);

    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, shipping_status FROM exchange.shipments ORDER BY id LIMIT 1`
    );
    if (!rows.length) throw new Error("dev has no shipment to test against");

    await client.query(
      `UPDATE exchange.shipments SET shipping_status = shipping_status || '-probe' WHERE id = $1`,
      [rows[0].id]
    );
    const dirty = await fingerprint(client, names);
    const seen = compare(start, dirty);

    await client.query("ROLLBACK");
    const clean = await fingerprint(client, names);
    const after = compare(start, clean);

    if (seen.length !== 1 || !seen[0].includes("contents changed in place")) {
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
  const invocation = suiteInvocation();
  console.log(
    `running the suite as ${invocation.source} defines it: ` +
      `${Object.entries(invocation.env).map(([k, v]) => `${k}=${v}`).join(" ")} ` +
      `node ${invocation.args.join(" ")}`
  );
  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: SUITE_CWD,
      env: { ...process.env, ...invocation.env },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("close", (code) => resolve(code));
  });
}

async function audit() {
  const names = await tables(pool);
  console.log(`fingerprinting ${names.length} tables across ${SCHEMAS.length} schemas`);
  const before = await fingerprint(pool, names);

  console.log("running the suite\n");
  const code = await runSuite();
  console.log(`\nsuite exited ${code}`);

  const after = await fingerprint(pool, names);
  const changed = compare(before, after);

  if (!changed.length) {
    console.log(`\nno table changed - the suite leaves nothing behind in dev`);
  } else {
    console.error(`\n${changed.length} table(s) changed:\n`);
    for (const line of changed) console.error(`  ${line}`);
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
