// Rebuilds the `test` database from DEV, so the suite can stop running against
// the database the application uses.
//
// *** WHY NOT refresh-from-backup.mjs, WHICH ALREADY DOES THIS. *** That one
// restores `test` from a PRODUCTION archive, and `env.ts` records why the
// USE_TEST_DB switch has been unusable ever since it was written: production
// has no leads, rates, reviews, products, metals or media schema at all. The
// migrations create them and leave them empty, so every repo.next test reads
// zero rows and fails. That is the same blocker as promotion and it is not
// going away soon.
//
// **A copy of DEV has no such gap**, because dev is where the migrations have
// actually run. That is the whole idea here, and it is what took the suite from
// uncompletable to 992/992 in 20 seconds (docs/waves/local-postgres.md).
//
//   node scripts/provision-test-db.ts              what it WOULD do
//   node scripts/provision-test-db.ts --commit     do it
//
// *** IT DESTROYS THE TARGET, SO THE GUARDS ARE THE POINT. *** Same rules as
// refresh-from-backup.mjs, which they are modelled on:
//   - the target's database NAME must be on REFRESHABLE. An allowlist, so a
//     name nobody taught it about is refused rather than accepted.
//   - it asks the SERVER for current_database() on both ends and refuses if
//     they are the same database, which survives a renamed URL.
//   - it refuses if the source is not reachable, rather than restoring nothing
//     over something.
//   - dry by default. --commit is the only way to write.
// The source is opened READ ONLY and never written.
//
// *** NO --self-test, FOR THE SAME REASON refresh-from-backup.mjs HAS NONE. ***
// Every path that does anything WRITES, and a self-test would need two real
// databases to write between. The harness also requires a `pass` case, and the
// only honest pass here is a dry run against a reachable pair - which is
// environment-dependent and would fail in CI. Excused as an action in
// lint-script-guards.mjs.
//
// The four refusals WERE exercised by hand, 2026-08-29, each exiting 1:
//   target "prod"            -> refusing to rebuild "prod" - not on the allowlist
//   source and target "test" -> refusing: ... the same database
//   TEST_DATABASE_URL unset  -> there is nothing to provision
//   unreachable source       -> could not connect to the source: ECONNREFUSED
import "#env";
import pg from "pg";
import { spawnSync } from "node:child_process";

// Names this is allowed to destroy. `test` and nothing else, ever.
const REFRESHABLE = new Set(["test"]);

// The 16 client, explicitly. Plain `pg_dump` on PATH here is 14.24 and refuses
// a 16 server with "aborting because of server version mismatch" - which cost a
// full dump cycle to work out, so it is pinned rather than hoped for.
const PG_BIN = process.env.PG16_BIN ?? "/usr/lib/postgresql/16/bin";

const COMMIT = process.argv.includes("--commit");

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const nameOf = (url: string): string => {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")); }
  catch { return ""; }
};

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.TEST_DATABASE_URL;

if (!targetUrl) die("TEST_DATABASE_URL is not set - there is nothing to provision");
if (!sourceUrl) die("DATABASE_URL is not set - there is nothing to copy FROM");

const targetName = nameOf(targetUrl);
const sourceName = nameOf(sourceUrl);

if (!REFRESHABLE.has(targetName)) {
  die(
    `refusing to rebuild "${targetName}" - not on the allowlist ` +
    `(${[...REFRESHABLE].join(", ")}). This script DROPS every schema in the ` +
    `target, so it will only ever point at a database named for disposal.`
  );
}

if (targetName === sourceName) {
  die(`refusing: source and target are both "${targetName}" - the same database`);
}

console.log(`source: ${sourceName} (read only)`);
console.log(`target: ${targetName}`);
console.log(`mode:   ${COMMIT ? "COMMIT - the target will be rebuilt" : "dry run, nothing is written"}\n`);

// THE CHECK THAT SURVIVES A RENAMED URL. Two URLs can spell different names and
// reach one database; ask the server rather than the string.
const connect = async (url: string, what: string) => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try { await c.connect(); } catch (e) {
    die(`could not connect to ${what}: ${(e as Error).message}`);
  }
  return c;
};

const src = await connect(sourceUrl, "the source");
const tgt = await connect(targetUrl, "the target");

const idOf = async (c: pg.Client) => {
  const { rows } = await c.query<{ db: string; sys: string }>(
    "SELECT current_database() db, system_identifier::text sys FROM pg_control_system()"
  );
  return `${rows[0]!.sys}/${rows[0]!.db}`;
};

const srcId = await idOf(src);
const tgtId = await idOf(tgt);
if (srcId === tgtId) {
  await src.end(); await tgt.end();
  die(`refusing: both URLs resolve to the same database (${srcId})`);
}

const { rows: schemas } = await tgt.query<{ nspname: string }>(`
  SELECT nspname FROM pg_namespace
   WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
   ORDER BY 1`);

const { rows: srcCount } = await src.query<{ n: number }>(`
  SELECT count(*)::int n FROM pg_namespace
   WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'`);

console.log(`${srcCount[0]!.n} schema(s) in the source`);
console.log(`${schemas.length} schema(s) in the target, all of which would be dropped:`);
console.log(`  ${schemas.map((s) => s.nspname).join(", ") || "(none)"}\n`);

if (!COMMIT) {
  console.log("dry run - nothing was written. Re-run with --commit.");
  await src.end(); await tgt.end();
  process.exit(0);
}

// Drop the target's schemas, then restore. `public` is recreated because a
// bare database has one and pg_dump's output assumes it.
for (const { nspname } of schemas) {
  await tgt.query(`DROP SCHEMA IF EXISTS ${JSON.stringify(nspname).replace(/"/g, '"')} CASCADE`);
}
await tgt.query("CREATE SCHEMA IF NOT EXISTS public");
console.log(`dropped ${schemas.length} schema(s) in ${targetName}`);
await src.end(); await tgt.end();

const dump = spawnSync(
  `${PG_BIN}/pg_dump`,
  ["--no-owner", "--no-privileges", "-d", sourceUrl],
  { encoding: "buffer", maxBuffer: 1024 * 1024 * 512 }
);
if (dump.status !== 0) {
  die(`pg_dump failed: ${dump.stderr?.toString().slice(0, 400)}`);
}
console.log(`dumped ${(dump.stdout.length / 1024 / 1024).toFixed(1)} MB from ${sourceName}`);

const restore = spawnSync(
  `${PG_BIN}/psql`,
  ["-q", "-v", "ON_ERROR_STOP=1", "-d", targetUrl],
  { input: dump.stdout, encoding: "buffer", maxBuffer: 1024 * 1024 * 512 }
);
const restoreErr = restore.stderr?.toString() ?? "";
if (restore.status !== 0) {
  die(`restore failed: ${restoreErr.slice(0, 800)}`);
}

const check = await connect(targetUrl, "the target");
const { rows: after } = await check.query<{ n: number }>(`
  SELECT count(*)::int n FROM pg_namespace
   WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'`);
await check.end();

console.log(`restored into ${targetName}: ${after[0]!.n} schema(s)`);

// A restore that produced fewer schemas than the source is a restore that
// quietly dropped something - pg_restore and psql both recover from errors and
// can exit 0 having done so, which is the defect compare:databases exists for.
if (after[0]!.n < srcCount[0]!.n) {
  die(
    `\nSCHEMA COUNT FELL: ${srcCount[0]!.n} in the source, ${after[0]!.n} here. ` +
    `Something did not restore. Run compare:databases before trusting this.`
  );
}
console.log("\nprovisioned. Run: pnpm --filter @dorado/api test:on-test-db");
