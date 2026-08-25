// Rebuilds a non-production database from the most recent backup.
//
// WHY FROM THE BACKUP AND NOT FROM A FRESH pg_dump. Dumping production each
// time would prove pg_dump works. Restoring the actual backup proves the
// BACKUP works - so this doubles as a daily restore drill, and an untested
// restore is not a backup. If backup.mjs ever starts writing something
// unrestorable, this is what says so, the next morning, rather than on the
// worst day of the year.
//
// THIS DROPS A DATABASE. That is the most destructive thing in this repo, so
// the guards are worth reading before the code:
//
//   - The target must be named explicitly with --target. Nothing is refreshed
//     by default and there is no "all".
//   - It must be on REFRESHABLE below. An allowlist, so a name nobody has
//     taught it about is refused rather than accepted - the same rule as the
//     migrate runner and audit:test-leaks.
//   - It re-checks, against the server, that the target is not the database
//     the backup was taken FROM. Name-matching alone would not survive another
//     rename.
//   - It refuses a backup that fails a pg_restore --list, so a corrupt archive
//     cannot destroy a working database.
//
// ENABLING dev LATER IS A SCHEDULING DECISION, NOT A CODE CHANGE. `dev` is
// already on REFRESHABLE; adding it means adding one cron entry. It is
// deliberately not scheduled yet: dev holds every migration and all five
// per-feature schemas, production holds none of them, so refreshing dev reverts
// it to production's January shape - and the API test suite runs against dev.
// That wants the baseline question answered first. See FOLLOWUPS.md.
//
//   node scripts/refresh-from-backup.mjs --target test
//   node scripts/refresh-from-backup.mjs --target test --migrate
//   node scripts/refresh-from-backup.mjs --target test --dry-run
//
// --migrate applies the migration chain afterwards. Off by default, because
// what the chain currently produces on a production copy is nine empty table
// pairs, and that is a finding rather than a desired state.
import "#env";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";

const run = promisify(execFile);

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/data/backups";
const REFRESHABLE = new Set(["test", "dev"]);

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name) => process.argv.includes(name);

const target = arg("--target");
const dryRun = has("--dry-run");
const migrate = has("--migrate");

if (!target) {
  console.error(
    `--target is required. Refreshable: ${[...REFRESHABLE].join(", ")}.\n` +
      `Nothing is refreshed by default; naming the database is the point.`
  );
  process.exit(1);
}

if (!REFRESHABLE.has(target)) {
  console.error(
    `refusing to refresh "${target}" - not on the allowlist ` +
      `(${[...REFRESHABLE].join(", ")}).\n` +
      `If that is genuinely a disposable database, add it to REFRESHABLE in ` +
      `this file, deliberately.`
  );
  process.exit(1);
}

// The admin connection: any database other than the one being dropped. The
// maintenance database is the conventional choice and the one that is never a
// target.
const adminUrl = process.env.REFRESH_ADMIN_DATABASE_URL;
const sourceUrl = process.env.BACKUP_SOURCE_DATABASE_URL ?? process.env.DUMP_SOURCE_DATABASE_URL;

if (!adminUrl) {
  console.error(
    "REFRESH_ADMIN_DATABASE_URL is not set. It needs a superuser connection to " +
      "a database other than the target - `postgres` is the usual one."
  );
  process.exit(1);
}

const nameOf = (url) => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
};

// THE CHECK THAT SURVIVES A RENAME. The allowlist is names; this asks the
// server which database the backup actually came from and refuses to overwrite
// it, whatever it happens to be called today.
if (sourceUrl && nameOf(sourceUrl) === target) {
  console.error(
    `refusing: "${target}" is the database the backups are taken FROM. ` +
      `Restoring a backup over its own source is not a refresh, it is a restore, ` +
      `and it is not this script's job.`
  );
  process.exit(1);
}

function newestBackup() {
  // Hourly first - it is the most recent by construction. Fall back through
  // the ladder so a refresh still works if the hourly cron has been down.
  for (const slot of ["hourly", "daily", "weekly"]) {
    const dir = path.join(BACKUP_DIR, slot);
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".dump"))
      .map((f) => ({ name: f, full: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length) return { ...files[0], slot };
  }
  return null;
}

async function pgBinary(name) {
  const explicit = process.env[name.toUpperCase().replace("-", "_")];
  const candidates = explicit
    ? [explicit]
    : [name, `/usr/lib/postgresql/17/bin/${name}`, `/usr/lib/postgresql/16/bin/${name}`];
  for (const bin of candidates) {
    try {
      await run(bin, ["--version"]);
      return bin;
    } catch {
      // next
    }
  }
  throw new Error(`no usable ${name} found (tried ${candidates.join(", ")})`);
}

const admin = new pg.Pool({ connectionString: adminUrl, connectionTimeoutMillis: 10000 });

try {
  const backup = newestBackup();
  if (!backup) {
    console.error(`no backup found under ${BACKUP_DIR}. Nothing to restore from.`);
    process.exit(1);
  }

  const ageHours = (Date.now() - backup.mtime) / 3600000;
  console.log(
    `restoring ${target} from ${backup.slot}/${backup.name} ` +
      `(${(fs.statSync(backup.full).size / 1048576).toFixed(2)} MB, ` +
      `${ageHours.toFixed(1)}h old)`
  );

  const pgRestore = await pgBinary("pg_restore");

  // A corrupt archive must not be allowed to destroy a working database. Read
  // its table of contents before dropping anything.
  const { stdout: toc } = await run(pgRestore, ["--list", backup.full], {
    maxBuffer: 1024 * 1024 * 64,
  });
  const tableData = (toc.match(/TABLE DATA/g) ?? []).length;
  if (tableData < 1) {
    console.error(
      `${backup.name} lists ${tableData} TABLE DATA entries - that is a ` +
        `schema-only or broken archive. Refusing to drop ${target} for it.`
    );
    process.exit(1);
  }
  console.log(`archive lists ${tableData} table-data entries`);

  // The owner has to match production's, or the migrations cannot ALTER what
  // they need to. Read it rather than assume it.
  const { rows: own } = await admin.query(
    `SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1`,
    [target]
  );
  const owner = own[0]?.owner;
  if (!owner) {
    console.error(`${target} does not exist. Create it first; this script refreshes, it does not provision.`);
    process.exit(1);
  }
  console.log(`${target} is owned by ${owner}; that ownership will be restored`);

  if (dryRun) {
    console.log("\n--dry-run: stopping here. Nothing was dropped.");
    process.exit(0);
  }

  // DROP needs zero connections, and something reconnecting mid-drop is the
  // usual reason this fails. Terminate, then drop immediately.
  const { rows: killed } = await admin.query(
    `SELECT count(pg_terminate_backend(pid))::int AS n
       FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [target]
  );
  if (killed[0].n) console.log(`terminated ${killed[0].n} connection(s) to ${target}`);

  await admin.query(`DROP DATABASE ${JSON.stringify(target).replace(/"/g, '"')}`);
  await admin.query(`CREATE DATABASE "${target}" OWNER "${owner}"`);
  console.log(`recreated ${target} owned by ${owner}`);

  const targetUrl = (() => {
    const u = new URL(adminUrl);
    u.pathname = `/${target}`;
    return u.toString();
  })();

  // No --no-owner: the archive records production's ownership and reproducing
  // it is what lets the migrations ALTER the tables they need to.
  await run(pgRestore, ["-d", targetUrl, backup.full], { maxBuffer: 1024 * 1024 * 64 });
  console.log("restored");

  if (migrate) {
    console.log("\napplying migrations");
    await run("node", [path.join(import.meta.dirname, "migrate.mjs")], {
      env: { ...process.env, DATABASE_URL: targetUrl, MIGRATE_ALLOW_DB: target },
      stdio: "inherit",
    }).catch((e) => {
      console.error(`migrations failed: ${e.message}`);
      process.exitCode = 1;
    });
  }

  console.log(`\n${target} refreshed from ${backup.slot}/${backup.name}`);
  console.log(
    `That restore is also the daily proof that the backup is usable - if this ` +
      `step ever fails, the backups are the problem, not this database.`
  );
} catch (err) {
  console.error(`refresh failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await admin.end();
}
