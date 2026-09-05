// RULING 82 - drop the abandoned January schemas so genesis can rebuild them.
//
// Jacob, 2026-09-06: "Drop and rebuild seems to make more sense. As long as
// it's not dropped exchange (until we've had a few weeks to verify all the new
// data is there and everything works)."
//
// Production holds ten of the seventeen native schemas, filled by a January
// 2026 refactor that was abandoned at 3 of 24 features. `000_genesis_schema.sql`
// is generated from dev and its DDL is `IF NOT EXISTS` throughout, so it CANNOT
// repair a table that already exists with the wrong shape - which is why the
// UAT rehearsal found 25 columns on the wrong timestamp type, 18 missing
// defaults, 20 missing NOT NULLs and 14 foreign keys still pointing at `core`
// (docs/waves/uat-rehearsal.md, F3-F6). Dropping them first turns production
// into the case the whole chain is actually tested for: a database that holds
// `exchange` and nothing else.
//
// THE COVENANT IS UNCHANGED. `exchange` is never in the drop list, and cannot
// be: the list is computed from pg_namespace MINUS a hard-coded protected set,
// and asserted against that set again immediately before anything is executed.
// This script issues no INSERT, UPDATE, DELETE or TRUNCATE at all - only
// DROP SCHEMA, only on names that survived both filters.
//
// It refuses to do anything until told, by flag, which database it is looking
// at and where the dump of it is. Dry by default.
//
//   node scripts/reset-january.ts --database uat --dump /path/prod.dump
//   node scripts/reset-january.ts --database uat --dump /path/prod.dump --commit
//
// Before dropping it PRINTS THE EVIDENCE ruling 82 rests on: for every schema
// it will drop, each table's row count and the newest timestamp in it. An
// operator can then see for themselves that what is going is January residue.

import fs from "node:fs";
import pg from "pg";

// ---------------------------------------------------------------- the rules
//
// The protected set and the subtraction that computes the drop list live in
// `scripts/lib/schemas.ts`, next to NATIVE_SCHEMAS, so one file answers "what
// is a schema here" for the whole toolchain. They are re-exported under this
// script's own names because this is where they are load-bearing.

import {
  PROTECTED_SCHEMAS as PROTECTED,
  isProtectedSchema as isProtected,
  droppableSchemas as droppable,
} from "./lib/schemas.ts";

export { PROTECTED, isProtected, droppable };

// ------------------------------------------------------------- the self-test

if (process.argv.includes("--self-test")) {
  const os = await import("node:os");
  const path = await import("node:path");
  const { selfTest } = await import("./lib/self-test-harness.ts");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reset-january-"));
  const REAL = path.join(dir, "prod.dump");
  const EMPTY = path.join(dir, "empty.dump");
  fs.writeFileSync(REAL, "PGDMP pretend");
  fs.writeFileSync(EMPTY, "");
  // selfTest() exits the process, so the cleanup has to be a hook.
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));

  const p = (schemas: string, ...rest: string[]) => [
    "--check-plan", "--schemas", schemas, "--database", "x", ...rest,
  ];
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "exchange is never in the drop list, however it is presented",
        args: p("exchange,orders,payments,core,auctions", "--dump", REAL),
        expect: "pass",
        mustPrint: "would drop: auctions, core, orders, payments",
      },
      {
        name: "a database holding only exchange has nothing to drop",
        args: p("exchange,public", "--dump", REAL),
        expect: "pass",
        mustPrint: "nothing to drop",
      },
      {
        name: "public, information_schema and pg_* are protected by construction",
        args: p("public,information_schema,pg_catalog,pg_toast,pg_temp_3,orders", "--dump", REAL),
        expect: "pass",
        mustPrint: "would drop: orders",
      },
      {
        name: "a protected name planted in the drop list is caught before anything runs",
        args: p("exchange,orders", "--dump", REAL),
        env: { RESET_JANUARY_INJECT_PROTECTED: "exchange" },
        expect: "fail",
        mustPrint: "protected schema reached the drop list",
      },
      {
        name: "refuses without --database",
        args: ["--check-plan", "--schemas", "orders", "--dump", REAL],
        expect: "fail",
        mustPrint: "--database",
      },
      {
        name: "refuses without --dump",
        args: p("orders"),
        expect: "fail",
        mustPrint: "--dump",
      },
      {
        name: "refuses a dump file that does not exist",
        args: p("orders", "--dump", path.join(dir, "nope.dump")),
        expect: "fail",
        mustPrint: "does not exist as a file",
      },
      {
        name: "refuses a zero-byte dump",
        args: p("orders", "--dump", EMPTY),
        expect: "fail",
        mustPrint: "is zero bytes",
      },
      {
        name: "refuses when --url names a different database than --database",
        args: ["--database", "uat", "--dump", REAL, "--url", "postgresql://h/other"],
        expect: "fail",
        mustPrint: "Refusing rather than dropping schemas",
      },
    ],
  });
}

// ------------------------------------------------------------------ the flags

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name: string) => argv.includes(name);

const CHECK_PLAN = has("--check-plan");
const COMMIT = has("--commit");
const DATABASE = flag("--database");
const URL_FLAG = flag("--url");
const DUMP = flag("--dump");

// Annotated on the CONST, not just the arrow: that is what lets TypeScript
// narrow after a call and know the code below is unreachable.
const die: (msg: string) => never = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (!DATABASE) {
  die(
    "refusing to run without --database <name>.\n" +
      "This script drops schemas. It will not infer its target from the " +
      "environment, and it will not read DATABASE_URL on its own: name the " +
      "database you mean, and the URL must resolve to it."
  );
}

if (!DUMP) {
  die(
    "refusing to run without --dump <file>.\n" +
      "Ruling 82 drops the January schemas AFTER the dump. Name the dump of " +
      `"${DATABASE}" that already exists; this script checks it is there and ` +
      "is not empty before it drops anything."
  );
}

const dumpStat = fs.existsSync(DUMP) ? fs.statSync(DUMP) : null;
if (!dumpStat || !dumpStat.isFile()) {
  die(`--dump ${DUMP} does not exist as a file. Take the dump first.`);
}
if (dumpStat.size === 0) {
  die(`--dump ${DUMP} is zero bytes. That is not a dump.`);
}

// ------------------------------------------------------------- the drop plan

function plan(present: string[]): string[] {
  const list = droppable(present);
  // Second assertion, deliberately not the same expression as the first: the
  // list is re-read against the protected set after it is built. The injection
  // hook exists so the self-test can prove this gate fires; it is added to what
  // is CHECKED and never to what is returned, so it cannot itself drop anything.
  const injected = process.env.RESET_JANUARY_INJECT_PROTECTED;
  const bad = [...list, ...(injected ? [injected] : [])].filter((s) => isProtected(s));
  if (bad.length) {
    die(
      `a protected schema reached the drop list: ${bad.join(", ")}.\n` +
        "Refusing. This is the covenant and there is no flag for it."
    );
  }
  return list;
}

function report(list: string[]): void {
  if (!list.length) {
    console.log(`${DATABASE}: nothing to drop - no schema outside the protected set.`);
    return;
  }
  console.log(`${DATABASE}: would drop: ${list.join(", ")}`);
  console.log(`protected, never dropped: ${PROTECTED.join(", ")}, pg_*`);
}

if (CHECK_PLAN) {
  const schemas = (flag("--schemas") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!schemas.length) die("--check-plan needs --schemas a,b,c");
  report(plan(schemas));
  process.exit(0);
}

// ---------------------------------------------------------------- the target

const connectionString = URL_FLAG ?? process.env.RESET_JANUARY_URL;
if (!connectionString) {
  die(
    "refusing to run without --url <connection string> (or RESET_JANUARY_URL).\n" +
      "Naming the database is not enough - the URL must be passed too, and it " +
      "must resolve to the database named."
  );
}

const parsed = new URL(connectionString);
const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (urlDatabase !== DATABASE) {
  die(
    `--database ${DATABASE} but --url points at "${urlDatabase}". ` +
      "Refusing rather than dropping schemas in a database nobody named."
  );
}

const loopback = ["127.0.0.1", "::1", "localhost"].includes(
  parsed.hostname.replace(/^\[|\]$/g, "")
);
const client = new pg.Client({
  connectionString,
  ...(loopback ? {} : { ssl: { rejectUnauthorized: false } }),
});

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await client.query(sql, params)).rows as T[];

await client.connect();
try {
  const [{ current_database: live }] = await q<{ current_database: string }>(
    "SELECT current_database()"
  );
  if (live !== DATABASE) {
    die(`connected to "${live}" but --database says "${DATABASE}". Refusing.`);
  }

  const present = (
    await q<{ nspname: string }>("SELECT nspname FROM pg_namespace ORDER BY 1")
  ).map((r) => r.nspname);

  if (!present.includes("exchange")) {
    die(
      `"${DATABASE}" has no exchange schema. That is not a Dorado database, or ` +
        "it is one this script has already been misaimed at. Refusing."
    );
  }

  const list = plan(present);
  report(list);
  if (!list.length) process.exit(0);

  // -------------------------------------------------- ruling 82's precondition
  //
  // Print what is about to go: every table, its row count, and the newest
  // timestamp any of its timestamp columns holds. Counts and dates only - no
  // row is ever selected.
  console.log("\nwhat is in them (ruling 82's precondition - counts only, never rows):");
  let totalRows = 0;
  let newest: string | null = null;

  const tables = await q<{ schema: string; name: string }>(
    `SELECT table_schema AS schema, table_name AS name
       FROM information_schema.tables
      WHERE table_schema = ANY($1) AND table_type = 'BASE TABLE'
      ORDER BY 1, 2`,
    [list]
  );

  for (const t of tables) {
    const stamps = (
      await q<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
            AND data_type IN ('timestamp with time zone', 'timestamp without time zone')
          ORDER BY column_name`,
        [t.schema, t.name]
      )
    ).map((r) => r.column_name);

    const newestExpr = stamps.length
      ? `GREATEST(${stamps.map((c) => `max("${c.replace(/"/g, '""')}")`).join(", ")})`
      : "NULL::timestamptz";
    const [row] = await q<{ n: string; newest: Date | null }>(
      `SELECT count(*)::text AS n, ${newestExpr}::timestamptz AS newest
         FROM "${t.schema}"."${t.name}"`
    );
    const n = Number(row.n);
    totalRows += n;
    const stamp = row.newest ? row.newest.toISOString().slice(0, 10) : "-";
    if (row.newest && (!newest || stamp > newest)) newest = stamp;
    console.log(`  ${`${t.schema}.${t.name}`.padEnd(38)} ${String(n).padStart(7)}  newest ${stamp}`);
  }

  console.log(
    `\n${tables.length} table(s) across ${list.length} schema(s), ${totalRows} row(s), ` +
      `newest timestamp anywhere: ${newest ?? "none"}.`
  );
  console.log(
    `The dump is ${DUMP} (${dumpStat.size} bytes). Everything above is in it, and ` +
      "genesis plus the backfills rebuild all of it from exchange."
  );

  if (!COMMIT) {
    console.log("\ndry run. Add --commit to drop them.");
    process.exit(0);
  }

  console.log("\ndropping:");
  for (const s of list) {
    if (isProtected(s)) die(`refusing: ${s} is protected`); // third and last gate
    await client.query(`DROP SCHEMA "${s.replace(/"/g, '""')}" CASCADE`);
    console.log(`  dropped ${s}`);
  }

  const left = (
    await q<{ nspname: string }>("SELECT nspname FROM pg_namespace ORDER BY 1")
  ).map((r) => r.nspname);
  const survivors = droppable(left);
  if (survivors.length) {
    die(`schemas survived the drop: ${survivors.join(", ")}`);
  }
  if (!left.includes("exchange")) {
    die("exchange is gone. This should be impossible; stop and restore the dump.");
  }
  console.log(
    `\n${DATABASE} now holds: ${left.filter((s) => !s.startsWith("pg_")).join(", ")}. ` +
      "exchange is intact. Run `migrate` next."
  );
} finally {
  await client.end();
}
