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
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");
const LOCK_KEY = 8451723; // arbitrary, just has to be stable

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
  const mode = process.argv[2] === "--status" ? "status" : "apply";

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  // Print where we are pointed. Applying to the wrong database is the one
  // mistake this tool must never make quietly.
  const target = new URL(process.env.DATABASE_URL);
  console.log(`database: ${target.pathname.slice(1)} @ ${target.hostname}`);

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
      for (const f of pending) {
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
