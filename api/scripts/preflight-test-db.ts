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
// *** ONE DATABASE PER WORKTREE/BRANCH (FOLLOWUPS D214 item 9, lesson added
// 2026-09-03). *** `env.ts` derives the database name from the current git
// branch: the main checkout (and the `api-hardening` branch specifically)
// gets plain `test`; any other worktree gets `test_<branch, sanitised>`. The
// point is that a migration written in one lane's worktree used to auto-apply
// against the SAME shared `test` database every other lane's suite was
// reading, so one lane's schema change broke every other lane's gate at
// once. If a branch's database does not exist yet, THIS script creates it
// with `CREATE DATABASE ... TEMPLATE test` (local cluster only, name must
// start with "test") so it starts already migrated, then applies whatever
// ran on `test` since.
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

// Guard kept from the allowlist provision-test-db.ts enforces on its own
// target: this script can CREATE a database, so it only ever does so for one
// whose name says it is disposable.
if (database && !database.startsWith("test")) {
  console.error(
    `refusing: the local test database name "${database}" does not start ` +
    `with "test". This script only creates or migrates databases named for ` +
    `disposal.`
  );
  process.exit(1);
}

let client = new pg.Client({ connectionString: url });

try {
  await client.connect();
} catch (e) {
  const code = (e as NodeJS.ErrnoException & { code?: string }).code;
  const isMissingDatabase = code === "3D000"; // invalid_catalog_name

  // Per-branch database, first use (FOLLOWUPS D214 item 9): create it from
  // `test` as a TEMPLATE rather than empty, so the copy IS the auto-migrate
  // for everything up to this point - only the migrations that landed since
  // still need applying below.
  if (isMissingDatabase && database !== "test") {
    console.log(`"${database}" does not exist yet - creating it from "test"...`);
    const adminUrl = new URL(url);
    adminUrl.pathname = "/postgres";
    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    try {
      await admin.connect();
      await admin.query(`CREATE DATABASE "${database}" TEMPLATE "test"`);
      console.log(`created "${database}" from the "test" template`);
    } catch (createErr) {
      console.error(
        `could not create "${database}" from the "test" template.\n\n` +
        `  ${(createErr as Error).message}\n\n` +
        `If "test" itself does not exist yet, provision it first:\n\n` +
        `  pnpm --filter @dorado/api provision:test -- --commit\n\n` +
        `A "being accessed by other users" error means another connection is ` +
        `open against "test" right now (another lane's suite, most likely) - ` +
        `retry once it is idle.`
      );
      process.exit(1);
    } finally {
      await admin.end();
    }

    client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
    } catch (retryErr) {
      console.error(
        `created "${database}" but could not connect to it: ` +
        `${(retryErr as Error).message}`
      );
      process.exit(1);
    }
  } else {
    console.error(
      `the local test database is not reachable on port ${port}.\n\n` +
      `  ${(e as Error).message}\n\n` +
      `The cluster is not started at boot. Start it with:\n\n${START}\n\n` +
      `Or run against dev instead:  pnpm --filter @dorado/api test:on-dev\n` +
      `See docs/waves/local-postgres.md.`
    );
    process.exit(1);
  }
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

  // *** THE TEST ACTOR (lane 2). *** Every audited table's created_by_id is a
  // foreign key to auth.users and the audit_stamp trigger resolves the
  // connection's `app.actor_id` against that table before stamping, so an
  // invented uuid stamps NOTHING rather than failing. The harness therefore
  // needs one real row to name, and it has to be COMMITTED - creating it
  // inside each pinned transaction would have every test file inserting the
  // same primary key at once, which serializes on the unique index in an
  // order the advisory locks know nothing about.
  //
  // Written here, once per test database, and idempotent afterwards. It does
  // reach `exchange.users` the first time, through migration 107's identity
  // mirror - which is why `audit:test-leaks` should be given a preflight of
  // its own before it fingerprints. Only ever this database: everything above
  // has already refused a target that is not local and not named for
  // disposal.
  const actors = await client.query(
    `INSERT INTO auth.users (id, email, name, role, "emailVerified")
     SELECT * FROM (VALUES
       ($1::uuid, $2::text, $3::text, 'user'::text, true),
       ($4::uuid, $5::text, $6::text, 'user'::text, true)
     ) AS v
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      "00000000-0000-4000-8000-0000000ac700",
      "zz-test-actor@dorado.test",
      "Test Actor",
      "00000000-0000-4000-8000-0000000c5700",
      "zz-test-customer@dorado.test",
      "Test Customer",
    ]
  );
  if (actors.rowCount) {
    console.log(`seeded ${actors.rowCount} named test person(s) (shared/testing/actor.ts)`);
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
        env: { ...process.env, DATABASE_URL: url, MIGRATE_ALLOW_DB: database },
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
