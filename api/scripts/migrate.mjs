// Forward-only SQL migrations.
//
// Migrations are plain .sql files in api/migrations, applied in filename order.
// Plain SQL rather than a DSL so they stay readable, reviewable in a PR, and
// runnable by hand through psql if something needs doing in an emergency.
//
//   pnpm --filter @dorado/api migrate:status   list applied and pending
//   pnpm --filter @dorado/api migrate          apply everything pending
//
// Each migration runs inside its own transaction, so a failure leaves the
// database exactly as it was. A session advisory lock stops two processes
// (or two deploys) applying concurrently. Applied files are checksummed, so
// editing one after it has run is reported rather than silently ignored.
import "#env";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { parseBaseline, coveredBy } from "./lib/baseline.mjs";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");
const LOCK_KEY = 8451723; // arbitrary, just has to be stable

// The only database this runner will write to without being told otherwise.
const DEFAULT_DB = "dorado_db_dev";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

// Splits a migration into individual statements.
//
// Needed only for no-transaction migrations: node-postgres sends a
// multi-statement string as a single simple query, and Postgres wraps those in
// an implicit transaction block - which is exactly what CREATE INDEX
// CONCURRENTLY refuses to run inside. Sending one statement per round trip
// avoids the implicit block.
//
// Aware of line comments, single-quoted strings and dollar-quoted bodies, so a
// semicolon inside any of those does not split a statement.
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", i);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (sql[i] === "'") {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      cur += sql.slice(i, stop);
      i = stop;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      cur += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (sql[i] === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += sql[i];
    i++;
  }

  if (cur.trim()) out.push(cur.trim());
  return out;
}

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
      return { name, sql, checksum: sha(sql) };
    });
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS exchange.schema_migrations (
      name        text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function applied(client) {
  const { rows } = await client.query(
    `SELECT name, checksum, applied_at FROM exchange.schema_migrations ORDER BY name`
  );
  return new Map(rows.map((r) => [r.name, r]));
}

async function main() {
  const arg = process.argv[2];
  const mode =
    arg === "--status" ? "status" : arg === "--reconcile" ? "reconcile" : "apply";
  const reconcileTarget = mode === "reconcile" ? process.argv[3] : null;

  if (mode === "reconcile" && !reconcileTarget) {
    console.error("usage: migrate.mjs --reconcile <migration-file.sql>");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  // Print where we are pointed. Applying to the wrong database is the one
  // mistake this tool must never make quietly.
  const target = new URL(process.env.DATABASE_URL);
  const database = target.pathname.slice(1);
  console.log(`database: ${database} @ ${target.hostname}`);

  // Naming the database out loud is not the same as refusing to touch the wrong
  // one. Anything other than dev has to be asked for by name:
  //
  //   MIGRATE_ALLOW_DB=dorado_db pnpm --filter @dorado/api migrate
  //
  // Applying to production is a deliberate act that happens once the pg_dump
  // has been taken, not something a stray shell should be able to do. `status`
  // is read-only and runs anywhere.
  const allowed = process.env.MIGRATE_ALLOW_DB ?? DEFAULT_DB;
  if (mode !== "status" && database !== allowed) {
    console.error(
      `refusing to apply migrations to "${database}" - this runner expects "${allowed}".\n` +
        `If that is genuinely the target, say so explicitly:\n` +
        `  MIGRATE_ALLOW_DB=${database} pnpm --filter @dorado/api migrate`
    );
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await ensureTable(client);
    const done = await applied(client);
    const files = migrationFiles();

    const changed = files.filter(
      (f) => done.has(f.name) && done.get(f.name).checksum !== f.checksum
    );
    for (const f of changed) {
      console.error(
        `warning: ${f.name} was modified after it was applied (migrations are immutable; add a new one)`
      );
    }

    const pending = files.filter((f) => !done.has(f.name));

    // Re-records the checksum of an already-applied migration.
    //
    // Migrations are immutable, and the checksum is what enforces that. But
    // editing a comment in one leaves a warning that is permanent and, being
    // permanent, gets ignored - which is worse than the mistake it reports. So
    // there is a way to clear it, deliberately, one file at a time, that says
    // out loud what it is doing.
    //
    // It does not verify that the SQL is unchanged - it cannot; that is the
    // point of the checksum. Reconciling is a statement by whoever runs it that
    // they have compared the applied object against the file and found them to
    // match. Use it for comment edits, not for anything that would change what
    // the migration builds. If the SQL changed, write a new migration.
    if (mode === "reconcile") {
      const f = files.find((x) => x.name === reconcileTarget);
      if (!f) {
        console.error(`no such migration: ${reconcileTarget}`);
        process.exit(1);
      }
      const row = done.get(f.name);
      if (!row) {
        console.error(`${f.name} has not been applied here; nothing to reconcile`);
        process.exit(1);
      }
      if (row.checksum === f.checksum) {
        console.log(`${f.name} already matches; nothing to do`);
        return;
      }
      await client.query(
        `UPDATE exchange.schema_migrations SET checksum = $2 WHERE name = $1`,
        [f.name, f.checksum]
      );
      console.log(`reconciled ${f.name}: ${row.checksum} -> ${f.checksum}`);
      return;
    }

    if (mode === "status") {
      for (const f of files) {
        const row = done.get(f.name);
        console.log(
          row
            ? `  applied  ${f.name}  ${row.applied_at.toISOString().slice(0, 19)}`
            : `  PENDING  ${f.name}`
        );
      }
      if (!files.length) console.log("  (no migrations)");
      return;
    }

    if (!pending.length) {
      console.log("nothing to apply");
      return;
    }

    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [
      LOCK_KEY,
    ]);
    if (!rows[0].ok) {
      console.error("another migration run holds the lock; try again shortly");
      process.exit(1);
    }

    try {
      // A baseline migration reproduces the schema as of some later migration,
      // so the ones it subsumes must be recorded rather than run. 000 creates
      // every table in the shape dev has now, which is the shape it reached
      // after 028 - re-running 002 through 028 on top of that would fail on the
      // first ALTER TABLE ADD CONSTRAINT, which has no IF NOT EXISTS.
      //
      // Declared in the file itself as `-- baseline: 028`. On a database that
      // has already applied those migrations - dev - the stamp is a no-op and
      // nothing is skipped, because there is nothing left pending to skip.
      const skip = new Set();

      for (const f of pending) {
        if (skip.has(f.name)) {
          console.log(`skipping ${f.name} (covered by a baseline)`);
          continue;
        }
        // CREATE INDEX CONCURRENTLY cannot run inside a transaction, and it is
        // how indexes get added to a live table without blocking writes. Such a
        // migration opts out with a leading `-- no-transaction` line, and gives
        // up all-or-nothing: if it fails partway, re-running skips what already
        // exists (hence IF NOT EXISTS in those files).
        const noTx = /^\s*--\s*no-transaction\b/m.test(f.sql);
        process.stdout.write(`applying ${f.name}${noTx ? " (no transaction)" : ""} ... `);

        if (!noTx) await client.query("BEGIN");
        try {
          if (noTx) {
            for (const stmt of splitStatements(f.sql)) await client.query(stmt);
          } else {
            await client.query(f.sql);
          }
          await client.query(
            `INSERT INTO exchange.schema_migrations (name, checksum) VALUES ($1, $2)`,
            [f.name, f.checksum]
          );
          const baseline = parseBaseline(f.sql);
          if (baseline) {
            const { from, through } = baseline;
            const covered = coveredBy(baseline, f.name, files, done);
            for (const x of covered) {
              await client.query(
                `INSERT INTO exchange.schema_migrations (name, checksum) VALUES ($1, $2)
                 ON CONFLICT (name) DO NOTHING`,
                [x.name, x.checksum]
              );
              skip.add(x.name);
            }
            if (covered.length) {
              process.stdout.write(`(baseline ${from}-${through}: recorded ${covered.length}) `);
            }
          }
          if (!noTx) await client.query("COMMIT");
          console.log("ok");
        } catch (err) {
          if (!noTx) await client.query("ROLLBACK");
          console.log("FAILED");
          console.error(
            `\n${f.name} ${noTx ? "failed (not rolled back - see above)" : "rolled back"}:\n  ${err.message}\n`
          );
          process.exit(1);
        }
      }
      console.log(`applied ${pending.length} migration(s)`);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
