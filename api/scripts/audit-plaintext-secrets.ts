// Every column in the database that holds a bank number in the clear.
//
// *** WHY A DETECTOR AND NOT A ONE-OFF CHECK. *** CLAUDE.md's oldest standing
// constraint is "never log or return bank details", and the exposure it names
// has been described in three places with three different numbers, none of them
// measured recently. The count is not the point - the point is that nothing
// watched the columns, so a new one could appear and no gate would notice. This
// asks the database directly, on every run.
//
// *** IT NAMES NO VALUES, EVER. *** Output is schema.table.column, a count and a
// verdict. Not a sample, not a prefix, not a last-4. A script that prints what
// it found would put the secret in a terminal, a CI log and a scrollback buffer
// - three more places than it started in.
//
//   node scripts/audit-plaintext-secrets.ts            dev
//   node scripts/audit-plaintext-secrets.ts --prod     production, read-only
//   node scripts/audit-plaintext-secrets.ts --self-test
//
// *** EXITS NON-ZERO WHILE ANY PLAINTEXT REMAINS, BY DESIGN *** - the same
// contract as audit:payments and audit:enum-domains, and for the same reason:
// this is outstanding work, not a passing test. It is therefore NOT in
// `pnpm check`. It goes green the day the clearing migration runs against
// production, which is Jacob's to run.
//
// *** THE FLOOR. *** A scan that matches nothing looks exactly like a database
// with no secrets in it - the defect this codebase has shipped six times. So the
// column scan asserts it found the columns it already knows about, and fails
// loudly if it did not. Discovering zero candidate columns is a broken scan, not
// a clean bill of health.
import "#env";
import pg from "pg";

// Identifiers come from information_schema rather than from a user, but they are
// still interpolated into SQL, and "it cannot be hostile here" is how the next
// one gets in. Quote them.
const quote = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      { name: "refuses --prod with no PROD_READONLY_DATABASE_URL", expect: "fail",
        args: ["--prod"], env: { PROD_READONLY_DATABASE_URL: "" },
        mustPrint: "PROD_READONLY_DATABASE_URL" },
      { name: "refuses a database it cannot reach", expect: "fail",
        env: { DATABASE_URL: "postgresql://nobody@127.0.0.1:1/nope" },
        mustPrint: "could not connect" },
      { name: "scans dev and reports", expect: "pass",
        env: { AUDIT_PLAINTEXT_TOLERATE_FINDINGS: "1" },
        mustPrint: "candidate column(s)" },
    ],
  });
}

const PROD = process.argv.includes("--prod");
// The self-test needs one `pass` case, and on a database that still holds
// plaintext the honest exit is non-zero. This lets the harness assert the SCAN
// works without asserting the database is clean.
const TOLERATE = process.env.AUDIT_PLAINTEXT_TOLERATE_FINDINGS === "1";

const url = PROD ? process.env.PROD_READONLY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error(PROD
    ? "PROD_READONLY_DATABASE_URL is not set"
    : "DATABASE_URL is not set");
  process.exit(1);
}

// Column NAMES that would hold a secret. Matched against every table in every
// schema, so a new table inherits the check for free - which is the whole
// reason this is a pattern match rather than a hand-listed set of locations.
const SECRET_NAME = `(
     c.column_name ~ '(^|_)(routing|account)_number$'
  OR c.column_name ~ '(^|_)(ssn|tax_id|iban|swift)$'
)`;

// Columns that hold the SEALED form are expected to be populated and are not
// findings. They are recognised by name so that renaming one to something
// unrecognised makes it a finding again rather than silently exempt.
const IS_SEALED = `c.column_name LIKE '%_encrypted'`;

const client = new pg.Client({
  connectionString: url,
  ssl: PROD ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
} catch (e) {
  console.error(`could not connect: ${(e as Error).message}`);
  process.exit(1);
}

let findings = 0;

try {
  const { rows: dbname } = await client.query<{ d: string }>("SELECT current_database() d");
  console.log(`database: ${dbname[0]!.d}${PROD ? "  (production, read-only)" : ""}\n`);

  const { rows: columns } = await client.query<{
    table_schema: string; table_name: string; column_name: string;
  }>(`
    SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
       AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
       AND ${SECRET_NAME}
       AND NOT ${IS_SEALED}
     ORDER BY 1, 2, 3
  `);

  console.log(`${columns.length} candidate column(s) found by name`);

  // THE FLOOR. exchange.payouts has held these two columns since before the
  // migration began; if the scan cannot see them it is not working, and a
  // report of "no plaintext anywhere" would be a lie.
  const KNOWN = ["exchange.payouts.routing_number", "exchange.payouts.account_number"];
  const seen = new Set(columns.map((c) => `${c.table_schema}.${c.table_name}.${c.column_name}`));
  const missing = KNOWN.filter((k) => !seen.has(k));
  if (missing.length) {
    console.error(
      `\nSCAN IS BROKEN: it did not find ${missing.join(", ")}, which this ` +
      `database is known to have. A zero result here would be a false all-clear.`
    );
    process.exit(1);
  }

  // Which of those tables carry a user_id, so the report can say how many
  // customers are exposed rather than only how many rows. Asked once.
  const { rows: withUser } = await client.query<{ k: string }>(`
    SELECT table_schema || '.' || table_name AS k
      FROM information_schema.columns
     WHERE column_name = 'user_id'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')
  `);
  const hasUserId = new Set(withUser.map((r) => r.k));

  for (const c of columns) {
    const qualified = `${c.table_schema}.${c.table_name}.${c.column_name}`;
    const table = `${quote(c.table_schema)}.${quote(c.table_name)}`;
    const col = quote(c.column_name);
    const users = hasUserId.has(`${c.table_schema}.${c.table_name}`)
      ? "count(DISTINCT user_id)::int"
      : "0";

    // COUNTED, NEVER SELECTED. The value does not enter this process, so it
    // cannot reach a log, a crash dump or an error message from here.
    const { rows } = await client.query<{ n: number; users: number }>(
      `SELECT count(${col})::int AS n, ${users} AS users
         FROM ${table} WHERE ${col} IS NOT NULL`
    );
    const n = rows[0]!.n;
    if (n === 0) {
      console.log(`  ok    ${qualified}  (empty)`);
    } else {
      findings += 1;
      const who = rows[0]!.users ? `, ${rows[0]!.users} customer(s)` : "";
      console.log(`  PLAIN ${qualified}  ${n} value(s)${who}`);
    }
  }

  console.log(
    findings === 0
      ? "\nno plaintext bank details at rest"
      : `\n${findings} column(s) hold plaintext bank details at rest`
  );
} finally {
  await client.end();
}

if (findings && !TOLERATE) process.exit(1);
