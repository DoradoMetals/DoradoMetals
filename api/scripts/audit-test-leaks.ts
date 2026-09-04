import pg from "pg";
import type { Pool, PoolClient } from "pg";
import path from "node:path";
import { spawn } from "node:child_process";

import { suiteInvocation } from "./lib/suite-invocation.ts";

const SUITE_CWD = path.resolve(import.meta.dirname, "..");

const SELF_TEST = process.argv.includes("--self-test");

const invocation = suiteInvocation();
for (const [key, value] of Object.entries(invocation.env)) {
  process.env[key] = value;
}
await import("#env");

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

const RESERVED_SCHEMA = new Set(["information_schema", "public"]);

type Queryable = Pool | PoolClient;

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
  const seen = new Set<string>(rows.map((r) => r.schema));
  const blind = schemaNames.filter((s) => !seen.has(s));
  if (blind.length) {
    console.error(`REFUSING TO REPORT: ${blind.join(", ")} exist(s) but yielded no readable tables.`);
    console.error("A schema that contributes nothing looks identical to one that leaked nothing.");
    process.exit(1);
  }
  return rows.map((r) => `${r.schema}.${r.name}`);
}

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

function runSuite() {
  console.log(
    `running the suite as ${invocation.source} defines it: ${invocation.shellCommand}`
  );
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

  if (code !== 0) process.exitCode = 1;
}

try {
  await (SELF_TEST ? selfTest() : audit());
} finally {
  await pool.end();
}
