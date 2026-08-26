// TEXT VALUES THAT ARE COMPARED AGAINST AN ENUM, AND ARE NOT LABELS OF IT.
//
// WHY THIS EXISTS. `exchange.products.product_type` is text. So is its successor
// `products.bullion.type`. But the sales-tax rule match compares that value
// against `sales_tax_rules.product_type`, which is an ENUM:
//
//     AND r.product_type IN ($3, 'All')          -- $3 = item.product_type
//
// Postgres has to coerce $3 to the enum to run that comparison, and a value
// that is not a label does not simply fail to match - it raises
// 22P02 invalid input value for enum. The whole tax calculation throws.
//
// Nothing was checking the coupling, because it is not a foreign key and not a
// constraint. It is two columns in different tables that must agree by VALUE,
// with the type declared on only one of them. audit:constraints compares
// constraints; audit:precision casts a source value into its own target's type,
// and here the source column's own target is text, so the cast is clean. The
// value only becomes invalid somewhere else entirely.
//
// WHAT IT FOUND. Two production products carry
//
//     product_type = E'\n\tBar'
//
// - a newline and a tab in front of "Bar", five characters where "Bar" is
// three. Note that `btrim()` does NOT report them: btrim's default character
// set is spaces only, so the obvious data-quality check says clean.
//
// Not currently reachable: both rows are display = false with stock 0, and no
// production sales-order line references either. But `GET /get_product_types`
// is `SELECT DISTINCT product_type` with no filter, so the admin product-type
// dropdown offers the corrupt value as a fourth option beside the real "Bar" -
// which is the most likely way the two rows got it, and the way more would.
//
// Exits non-zero while any value is outside its enum, deliberately, in the way
// audit:payments does: this reports an outstanding data problem rather than a
// regression, and fixing it means writing to production, which is not this
// repo's to do. It is D39.

import "#env";
import { Pool } from "pg";

const prod = process.argv.includes("--prod");
const url = prod ? process.env.PROD_READONLY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error(prod ? "PROD_READONLY_DATABASE_URL is not set" : "DATABASE_URL is not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

// Two columns in different tables that must agree by value, with the type
// declared on only one of them. Each entry names the query that couples them,
// so a reader can check the claim rather than trust the map.
const COUPLINGS = [
  {
    table: "exchange.products", column: "product_type",
    enumSchema: "exchange", enumType: "sales_tax_product_type",
    site: "features/sales-tax/repo.exchange.js - r.product_type IN ($3, 'All'), $3 = item.product_type",
  },
  {
    table: "products.bullion", column: "type",
    enumSchema: "tax", enumType: "sales_tax_product_type",
    site: "features/sales-tax/repo.next.ts - r.product_type IN ($3, 'All')",
  },
  {
    table: "exchange.metals", column: "type",
    enumSchema: "exchange", enumType: "sales_tax_metal_category",
    site: "features/sales-tax/repo.exchange.js - r.metal_category IN ($2, 'All')",
  },
  {
    table: "metals.metals", column: "name",
    enumSchema: "tax", enumType: "sales_tax_metal_category",
    site: "features/sales-tax/repo.next.ts - r.metal_category IN ($2, 'All')",
  },
];

// Qualified by SCHEMA as well as name. Three schemas define an enum called
// sales_tax_product_type, and matching on typname alone returns every label
// three times - the same shared-name mistake that has produced false findings
// on this project before.
const labelsOf = async (schema, type) => {
  const { rows } = await pool.query(
    `SELECT e.enumlabel::text AS label
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = $1 AND n.nspname = $2`,
    [type, schema]
  );
  return rows.map((r) => r.label);
};

let checked = 0;
const bad = [];
const skipped = [];

for (const c of COUPLINGS) {
  const [schema, table] = c.table.split(".");
  const { rows: exists } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, c.column]
  );
  if (!exists.length) { skipped.push(`${c.table}.${c.column} - no such column`); continue; }

  const labels = await labelsOf(c.enumSchema, c.enumType);
  if (!labels.length) { skipped.push(`${c.enumSchema}.${c.enumType} - no such enum`); continue; }

  checked += 1;
  const { rows } = await pool.query(
    `SELECT ${c.column}::text AS value, count(*)::int AS n
       FROM ${c.table}
      WHERE ${c.column} IS NOT NULL AND ${c.column}::text <> ALL($1::text[])
      GROUP BY 1 ORDER BY 2 DESC`,
    [labels]
  );
  for (const r of rows) bad.push({ ...c, value: r.value, n: r.n, labels });
}

console.log(`${prod ? "production" : "dev"}: ${checked} value coupling(s) checked against their enum`);
if (skipped.length) for (const s of skipped) console.log(`  skipped: ${s}`);

if (bad.length === 0) {
  console.log("\nevery value that reaches an enum comparison is a label of that enum");
} else {
  console.log(`\n${bad.length} value(s) that would raise 22P02 rather than simply not match:\n`);
  for (const b of bad) {
    // JSON.stringify so a newline or a tab is visible rather than printed.
    console.log(`  ${b.table}.${b.column} = ${JSON.stringify(b.value)}  (${b.n} row(s))`);
    console.log(`      valid labels: ${b.labels.join(", ")}`);
    console.log(`      coupled at:   ${b.site}`);
  }
  console.log(
    "\nFixing this means an UPDATE against production data, which is not this\n" +
    "repo's to run - see D39. Exits non-zero by design while it is outstanding."
  );
}

await pool.end();
process.exit(bad.length ? 1 : 0);
