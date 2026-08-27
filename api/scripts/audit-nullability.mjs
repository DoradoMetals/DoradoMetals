// Reports, for every nullable column in the exchange schema, how many rows
// actually hold NULL. That is what decides which NOT NULL constraints can be
// added for free and which need a data decision first.
//
// Aggregate counts only - this never reads a row value, so it is safe to run
// against production and paste the output.
//
//   DATABASE_URL='<prod url>' node api/scripts/audit-nullability.mjs
import "#env";
import pg from "pg";

// This audit exists because dev row counts prove nothing - dev holds tens of
// rows where production holds thousands, and a column that is 100% null in dev
// is routinely populated in production. Defaulting to DATABASE_URL therefore
// had it answering the question it was built to avoid, and printing a report
// that looks authoritative either way.
//
// It reads the read-only production role now, and says which database it used.
// Override with DATABASE_URL only if you mean it.
const connectionString =
  process.env.AUDIT_DATABASE_URL ??
  process.env.PROD_READONLY_DATABASE_URL ??
  process.env.DATABASE_URL;

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const target = new URL(connectionString);
console.log(`# nullability audit: ${target.pathname.slice(1)} @ ${target.hostname}`);
console.log(`# generated ${new Date().toISOString()}`);
console.log();

// THE DENOMINATOR. information_schema is privilege-filtered: a table this role
// cannot touch does not appear here at all, and a shorter list is
// indistinguishable from a smaller schema. That is not hypothetical - on
// production this same role sees ZERO of the 9 tables in `core` and zero of the
// 2 in `auctions`, and an audit that walked those would have called them clean
// (D57). This one is the authority for adding NOT NULL against real data, so it
// states what it saw and refuses if the catalogue holds a table it cannot.
const { rows: [seen] } = await client.query(`
  SELECT count(*)::int AS in_catalogue,
         count(*) FILTER (WHERE i.table_name IS NOT NULL)::int AS visible
    FROM pg_tables c
    LEFT JOIN information_schema.tables i
      ON i.table_schema = c.schemaname AND i.table_name = c.tablename
   WHERE c.schemaname = 'exchange'
`);
console.log(`# exchange: ${seen.visible} of ${seen.in_catalogue} table(s) readable by this role`);
console.log();
if (seen.visible !== seen.in_catalogue) {
  console.error(
    `${seen.in_catalogue - seen.visible} exchange table(s) are in the catalogue but ` +
      `not readable by this role - this report would silently omit them`
  );
  await client.end();
  process.exit(1);
}

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
