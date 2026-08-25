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
import { spawn } from "node:child_process";

const SELF_TEST = process.argv.includes("--self-test");

// The suite runs against DATABASE_URL, so that is what has to be measured - and
// it must not be production. There is one Postgres instance with two databases,
// dorado_db_dev and dorado_db, and the difference is one word in a URL.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
if (/\/dorado_db(\?|$)/.test(url)) {
  console.error(
    "DATABASE_URL points at production. This script runs the test suite; refusing."
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

async function tables(client) {
  const { rows } = await client.query(
    `SELECT c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'exchange' AND c.relkind = 'r'
      ORDER BY c.relname`
  );
  return rows.map((r) => r.name);
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
         FROM exchange."${name}" t`
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
      changed.push(`exchange.${name} disappeared`);
    } else if (a.n !== b.n) {
      changed.push(`exchange.${name}: ${a.n} rows -> ${b.n} rows (${b.n - a.n >= 0 ? "+" : ""}${b.n - a.n})`);
    } else if (a.sum !== b.sum) {
      changed.push(`exchange.${name}: ${a.n} rows, contents changed in place`);
    }
  }
  for (const name of Object.keys(after)) {
    if (!before[name]) changed.push(`exchange.${name} appeared`);
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

function runSuite() {
  return new Promise((resolve) => {
    const child = spawn("node", ["--test"], {
      cwd: process.cwd(),
      env: { ...process.env, TZ: "UTC" },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("close", (code) => resolve(code));
  });
}

async function audit() {
  const names = await tables(pool);
  console.log(`fingerprinting ${names.length} exchange tables`);
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
