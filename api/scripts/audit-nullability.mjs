// Reports, for every nullable column in the exchange schema, how many rows
// actually hold NULL. That is what decides which NOT NULL constraints can be
// added for free and which need a data decision first.
//
// Aggregate counts only - this never reads a row value, so it is safe to run
// against production and paste the output.
//
//   DATABASE_URL='<prod url>' node api/scripts/audit-nullability.mjs
import "dotenv/config";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const target = new URL(process.env.DATABASE_URL);
console.log(`# nullability audit: ${target.pathname.slice(1)} @ ${target.hostname}`);
console.log(`# generated ${new Date().toISOString()}`);
console.log();

const { rows: tables } = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'exchange' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);

let free = 0;
let blocked = 0;

for (const { table_name } of tables) {
  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'exchange' AND table_name = $1 AND is_nullable = 'YES'
     ORDER BY ordinal_position`,
    [table_name]
  );
  if (!cols.length) continue;

  const total = (
    await client.query(`SELECT count(*)::int AS n FROM exchange."${table_name}"`)
  ).rows[0].n;

  const projection = cols
    .map((c) => `count(*) FILTER (WHERE "${c.column_name}" IS NULL)::int AS "${c.column_name}"`)
    .join(", ");
  const counts = (
    await client.query(`SELECT ${projection} FROM exchange."${table_name}"`)
  ).rows[0];

  const clean = cols.map((c) => c.column_name).filter((c) => counts[c] === 0);
  const dirty = cols.map((c) => c.column_name).filter((c) => counts[c] > 0);

  free += clean.length;
  blocked += dirty.length;

  console.log(`${table_name}  (${total} rows)`);
  if (clean.length) console.log(`  free:    ${clean.join(", ")}`);
  for (const c of dirty) {
    const pct = total ? Math.round((counts[c] / total) * 100) : 0;
    console.log(`  nulls:   ${c}  ${counts[c]}/${total} (${pct}%)`);
  }
  console.log();
}

console.log(`# ${free} columns can take NOT NULL as-is, ${blocked} need a decision`);
await client.end();
