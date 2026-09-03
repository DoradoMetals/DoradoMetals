// Refuses to start the suite against a test database that is not there, and
// says what to do about it.
//
// *** WHY THIS EXISTS. *** Pointing the suite at a local cluster is the whole
// point of the pivot, and a local cluster is a thing that can simply be off -
// it is not started at boot. Without this, `pnpm test` on a stopped cluster
// fails as `ECONNREFUSED 127.0.0.1:5544` somewhere inside pg-pool, repeated
// once per test file, which says nothing about what to do. This is the
// difference between a workflow that works when its author runs it and one the
// repo actually has.
//
// It also catches the two mistakes that look identical from the outside: a
// database that is reachable but EMPTY (provisioned never, or dropped), and one
// that is reachable but is not the database you meant.
//
//   node scripts/preflight-test-db.ts
//
// Exits 0 if the suite can run, non-zero with instructions otherwise.
import "#env";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const url = process.env.DATABASE_URL ?? "";
const isLoopback = (() => {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return h === "127.0.0.1" || h === "::1" || h === "localhost";
  } catch { return false; }
})();

// USE_TEST_DB=1 with a REMOTE target is the one combination that looks right and
// is not. `env.ts` composes TEST_DATABASE_URL from PGHOST, so out of the box it
// names the Railway `test` database - which `refresh:test` fills from a
// PRODUCTION archive, and production has no leads, rates, reviews, products,
// metals or media schema. Every repo.next test would read zero rows. Say so
// here rather than let 900 assertions discover it one at a time.
if (process.env.USE_TEST_DB === "1" && !isLoopback) {
  console.error(
    `USE_TEST_DB=1, but the test database is remote.\n\n` +
    `  ${url.replace(/:[^:@/]*@/, ":****@")}\n\n` +
    `That database is filled from a PRODUCTION archive, and production is ` +
    `missing eight of the eighteen schemas - so most of the suite would read ` +
    `zero rows and fail. See env.ts.\n\n` +
    `Point TEST_DATABASE_URL at a LOCAL cluster instead. In api/.env:\n\n` +
    `  TEST_DATABASE_URL=postgresql://${process.env.USER ?? "you"}@127.0.0.1:5544/test\n\n` +
    `then:  pnpm --filter @dorado/api provision:test -- --commit\n` +
    `See docs/waves/local-postgres.md.`
  );
  process.exit(1);
}

// Otherwise only the local case is guarded. Against a remote database the suite
// has always just run, and a connection error there is not something this
// script can fix.
if (!isLoopback) process.exit(0);

const port = (() => { try { return new URL(url).port || "5432"; } catch { return "5432"; } })();
const database = (() => {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")); } catch { return ""; }
})();
const redacted = url.replace(/:[^:@/]*@/, ":****@");

const START = `~/pgroot/usr/lib/postgresql/16/bin/pg_ctl -D ~/pgdata16 \\
  -o "-p ${port} -c max_connections=200 -c unix_socket_directories=$HOME/pgsock" \\
  -l ~/pgdata16/server.log start`;

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
} catch (e) {
  console.error(
    `the local test database is not reachable on port ${port}.\n\n` +
    `  ${(e as Error).message}\n\n` +
    `The cluster is not started at boot. Start it with:\n\n${START}\n\n` +
    `Or run against dev instead:  pnpm --filter @dorado/api test:on-dev\n` +
    `See docs/waves/local-postgres.md.`
  );
  process.exit(1);
}

try {
  // Reachable but empty is the other failure that looks like success until 900
  // tests fail. `exchange` is the schema every fixture reads.
  const { rows } = await client.query<{ n: number }>(`
    SELECT count(*)::int n FROM pg_namespace WHERE nspname = 'exchange'`);
  if (rows[0]!.n === 0) {
    console.error(
      `the test database is reachable but has no \`exchange\` schema - it has ` +
      `never been provisioned, or it was dropped.\n\n` +
      `  pnpm --filter @dorado/api provision:test -- --commit\n`
    );
    process.exit(1);
  }

  const { rows: users } = await client.query<{ n: number }>(
    "SELECT count(*)::int n FROM exchange.users"
  );
  if (users[0]!.n === 0) {
    console.error(
      `the test database has an \`exchange\` schema but no users, so every ` +
      `fixture that reads one would assert nothing.\n\n` +
      `  pnpm --filter @dorado/api provision:test -- --commit\n`
    );
    process.exit(1);
  }

  const { rows: db } = await client.query<{ db: string }>("SELECT current_database() db");
  console.log(`test database ready: ${db[0]!.db} on ${port}, ${users[0]!.n} user(s)`);

  // KEEPING IT MIGRATED, AUTOMATICALLY - BUT ONLY HERE. `test` is disposable
  // and provisioned from dev, so re-running the migrator against it costs
  // nothing and nobody has to remember to. Nowhere else gets this: a "test"
  // that is not on loopback is either the Railway database refused above, or
  // some other database this script cannot vouch for - so that branch only
  // ever reports and refuses, exactly like a stale local cluster does.
  const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()
    : [];

  let appliedNames = new Set<string>();
  try {
    const { rows: applied } = await client.query<{ name: string }>(
      `SELECT name FROM exchange.schema_migrations`
    );
    appliedNames = new Set(applied.map((r) => r.name));
  } catch {
    // No schema_migrations table yet - every migration is pending, which is
    // exactly what an empty appliedNames set produces below.
  }

  const pending = files.filter((f) => !appliedNames.has(f));

  if (pending.length === 0) {
    console.log("no pending migrations");
  } else {
    const canAutoMigrate = isLoopback && database === (process.env.TEST_DATABASE ?? "test");
    console.log(`${pending.length} pending migration(s): ${pending.join(", ")}`);

    if (!canAutoMigrate) {
      console.error(
        `refusing to auto-migrate ${redacted} - it is not the local test ` +
        `database. Apply by hand if that is genuinely intended:\n\n` +
        `  MIGRATE_ALLOW_DB=${database} DATABASE_URL=${redacted} node scripts/migrate.mjs\n`
      );
      process.exit(1);
    }

    console.log("applying pending migrations to the local test database...");
    const result = spawnSync(
      process.execPath,
      ["scripts/migrate.mjs"],
      {
        cwd: path.join(import.meta.dirname, ".."),
        env: { ...process.env, DATABASE_URL: url, MIGRATE_ALLOW_DB: "test" },
        stdio: "inherit",
      }
    );
    if (result.status !== 0) {
      console.error("auto-migrating the local test database failed - see above");
      process.exit(result.status ?? 1);
    }
  }
} finally {
  await client.end();
}
