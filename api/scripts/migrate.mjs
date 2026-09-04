import "#env";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { parseBaseline, coveredBy } from "./lib/baseline.ts";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");
const LOCK_KEY = 8451723;

const DEFAULT_DBS = ["dev"];

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

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

  const target = new URL(process.env.DATABASE_URL);
  const database = target.pathname.slice(1);
  console.log(`database: ${database} @ ${target.hostname}`);

  const allowed = process.env.MIGRATE_ALLOW_DB
    ? [process.env.MIGRATE_ALLOW_DB]
    : DEFAULT_DBS;
  if (mode !== "status" && !allowed.includes(database)) {
    console.error(
      `refusing to apply migrations to "${database}" - this runner expects ` +
        `${allowed.map((d) => `"${d}"`).join(" or ")}.\n` +
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
      const skip = new Set();

      for (const f of pending) {
        if (skip.has(f.name)) {
          console.log(`skipping ${f.name} (covered by a baseline)`);
          continue;
        }
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
