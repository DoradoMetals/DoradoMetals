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

if (!isLoopback) process.exit(0);

const port = (() => { try { return new URL(url).port || "5432"; } catch { return "5432"; } })();
const database = (() => {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")); } catch { return ""; }
})();
const redacted = url.replace(/:[^:@/]*@/, ":****@");

const START = `~/pgroot/usr/lib/postgresql/16/bin/pg_ctl -D ~/pgdata16 \\
  -o "-p ${port} -c max_connections=200 -c unix_socket_directories=$HOME/pgsock" \\
  -l ~/pgdata16/server.log start`;

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
  const isMissingDatabase = code === "3D000";

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
