// Checks the generated table schemas against rows that actually exist.
//
// The generated schemas come from information_schema, so they should describe
// every row by construction. Running them over real data proves that, and more
// usefully catches the cases where a column's declared type and its actual
// contents disagree - a numeric holding something unparseable, a timestamp
// column the driver returns as a Date rather than a string, an enum with a
// value outside its own definition.
//
// Read-only. Safe to point at production.
//
//   pnpm --filter @dorado/contracts validate
// READS api/.env, NOT ITS OWN COPY - the same fix generate-tables.mjs already
// carries. `import "dotenv/config"` loads .env relative to the CURRENT WORKING
// DIRECTORY, and this package still has one naming `dorado_db_dev`, the name
// the databases had before they were renamed to prod/dev/test. So this script
// failed immediately for anybody who ran it, and nobody did: it is in no gate.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "api", ".env"),
});

// Register the same NUMERIC parser the API uses, so this validates the types
// the application actually sees rather than pg defaults.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));
import * as tables from "../dist/generated/tables.js";

const LIMIT = Number(process.env.VALIDATE_LIMIT ?? 200);

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const target = new URL(process.env.DATABASE_URL);
console.log(`validating against ${target.pathname.slice(1)} @ ${target.hostname}\n`);

const { rows: tableRows } = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'exchange' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);

const pascal = (s) =>
  s.split(/[_\s]+/).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

let checked = 0;
let clean = 0;
const failures = [];

for (const { table_name } of tableRows) {
  const schema = tables[`${pascal(table_name)}Row`];
  if (!schema) continue;

  // bytea reaches the wire as encode(col, 'base64'), so a raw SELECT * hands
  // back a Buffer the response never contains. Stand a string in its place
  // rather than reporting a divergence that only exists in this script.
  const { rows: byteaCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'exchange' AND table_name = $1 AND data_type = 'bytea'`,
    [table_name]
  );
  const encoded = byteaCols.map((c) => c.column_name);

  const { rows } = await client.query(
    `SELECT * FROM exchange."${table_name}" LIMIT ${LIMIT}`
  );
  if (!rows.length) continue;

  checked++;
  const problems = new Map();

  for (const row of rows) {
    // JSON round-trip: the contracts describe what crosses the wire, and that
    // is what the driver's Date values become in a response.
    const wire = JSON.parse(JSON.stringify(row));
    for (const col of encoded) {
      wire[col] = row[col] === null ? null : "";
    }
    const result = schema.safeParse(wire);
    if (result.success) continue;
    for (const issue of result.error.issues) {
      const key = `${issue.path.join(".")}: ${issue.message}`;
      problems.set(key, (problems.get(key) ?? 0) + 1);
    }
  }

  if (!problems.size) {
    clean++;
    continue;
  }
  failures.push({ table: table_name, rows: rows.length, problems });
}

for (const f of failures) {
  console.log(`${f.table}  (${f.rows} rows sampled)`);
  for (const [problem, count] of [...f.problems].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${count.toString().padStart(4)}x  ${problem}`);
  }
  console.log();
}

console.log(`${clean}/${checked} tables with data validate cleanly`);
if (failures.length) {
  console.log(`${failures.length} table(s) diverge - see above`);
  process.exitCode = 1;
}
await client.end();
