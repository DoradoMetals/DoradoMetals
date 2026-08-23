// Proves a schema migration has not lost data.
//
// Run before and after any migration that touches a table pair, and before
// promoting a feature's *_SOURCE switch. It answers one question in three
// parts, over every shared column rather than a sample:
//
//   1. is every source row present in the target        (nothing dropped)
//   2. does every shared column agree, row by row       (nothing corrupted)
//   3. does the target hold rows the source does not    (nothing about to be
//                                                        overwritten by a
//                                                        backfill re-run)
//
// Part 3 is the one that matters after a switch has been promoted. Once a
// feature reads and writes the new schema, the old one stops being updated, and
// re-running a backfill would overwrite the new schema's rows with stale
// values. If this reports target-only rows, DO NOT run a backfill.
//
// Read-only. Safe against production.
//
//   node scripts/verify-parity.mjs                     all known pairs
//   node scripts/verify-parity.mjs exchange.leads leads.leads
import "#env";
import pool from "#db";

const PAIRS = [
  ["exchange.leads", "leads.leads"],
  // transaction_type becomes type, and the two order columns collapse into one
  // order_id resolved through orders.orders.direction - the same reshaping
  // orders.spots got. repo.next.js projects all three back, so the wire shape
  // is unchanged, and the transactions diff compares the values row by row.
  [
    "exchange.account_transactions",
    "payments.ledger",
    {
      intentionallyDropped: ["transaction_type", "purchase_order_id", "sales_order_id"],
      reason: "renamed to type/order_id; values compared by the transactions diff",
    },
  ],
  ["exchange.rates", "rates.rates"],
  ["exchange.reviews", "reviews.reviews"],
  ["exchange.sales_tax_rules", "tax.sales_tax_rules"],
  // exchange.metals is split across metals.metals and spots.spots, so it is
  // compared against a view that reassembles the original shape. Comparing it
  // to metals.metals alone would report the quote columns as lost, which would
  // be a true statement about that table and a false one about the migration.
  // scrap_percentage and bullion_percentage are dropped on purpose: nothing in
  // the API or the frontend reads them, and rate tiering comes from rates.rates.
  // Recorded here rather than hidden, so the check still fails if anything else
  // goes missing.
  // checksum_sha256 is called checksum in the new schema. Declared as dropped so
  // the check does not report a rename as a loss; the value is verified by the
  // media diff, which aliases it back and compares the rows.
  // A supplier becomes an organization of type REFINER plus a refiners row that
  // carries the original supplier id. Compared against a view reassembling the
  // exchange shape, since no single table holds it.
  ["exchange.suppliers", "refiners.exchange_compat"],
  // A carrier becomes an organization of type CARRIER plus a shipping.carriers
  // row keeping the original id, so it is compared against a view reassembling
  // the exchange shape.
  ["exchange.carriers", "shipping.carriers_exchange_compat"],
  // A mint keeps its own row but its description and website move to the
  // organization it is, so it is compared against a view reassembling the
  // exchange shape. The view also converts timestamptz back to naive UTC.
  ["exchange.mints", "products.mints_exchange_compat"],
  [
    "exchange.images",
    "media.images",
    {
      intentionallyDropped: ["checksum_sha256"],
      reason: "renamed to checksum; value compared by the media diff",
    },
  ],
  // Three columns are renamed rather than lost: exchange qualified them with a
  // `product_` prefix that is redundant once the table is called bullion. The
  // repo aliases them back, so the wire shape is unchanged and the values are
  // compared row by row by the products diff.
  [
    "exchange.products",
    "products.bullion",
    {
      intentionallyDropped: ["product_name", "product_description", "product_type"],
      reason: "renamed to name/description/type; values compared by the products diff",
    },
  ],
  [
    "exchange.metals",
    "metals.exchange_compat",
    {
      intentionallyDropped: ["scrap_percentage", "bullion_percentage"],
      reason: "dead columns; rate tiering moved to rates.rates",
    },
  ],
];

const split = (q) => {
  const [schema, table] = q.split(".");
  return { schema, table };
};

async function columnsOf(schema, table) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, udt_schema, udt_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table]
  );
  // information_schema reports every enum as USER-DEFINED, so data_type alone
  // cannot tell two different enums apart. The real identity is the qualified
  // udt name - exchange.sales_tax_metal_category and tax.sales_tax_metal_category
  // are distinct types that Postgres refuses to compare.
  return rows.map((r) => ({
    column_name: r.column_name,
    type:
      r.data_type === "USER-DEFINED" ? `${r.udt_schema}.${r.udt_name}` : r.data_type,
  }));
}

// Builds the pair of expressions used to compare one column across the two
// schemas. The same column is not always the same *type* on both sides, and
// the comparison has to account for that without becoming so loose that it
// stops catching real differences:
//
//   identical types      compare directly - exact, including numeric scale
//   naive vs aware time  read the naive side as UTC, then compare instants.
//                        exchange stores naive timestamps that are UTC in fact,
//                        so this compares the moments rather than the rendering
//   anything else        compare as text. Two enums of different types cannot
//                        be compared at all in Postgres, which is the case for
//                        exchange.sales_tax_rules and tax.sales_tax_rules
//
// Casting everything to text unconditionally would be wrong: timestamp and
// timestamptz render differently for the same instant, and numeric renders its
// stored scale, so it would report differences that are not there.
function comparison(name, fromType, toType) {
  const l = `e."${name}"`;
  const r = `t."${name}"`;

  if (fromType === toType) return [l, r];

  const naive = "timestamp without time zone";
  const aware = "timestamp with time zone";
  if (fromType === naive && toType === aware) return [`${l} AT TIME ZONE 'UTC'`, r];
  if (fromType === aware && toType === naive) return [l, `${r} AT TIME ZONE 'UTC'`];

  return [`${l}::text`, `${r}::text`];
}

async function verify(from, to, options = {}) {
  const a = split(from);
  const b = split(to);

  const [ca, cb] = [await columnsOf(a.schema, a.table), await columnsOf(b.schema, b.table)];
  if (!ca.length || !cb.length) {
    console.log(`${from} -> ${to}\n   MISSING TABLE\n`);
    return false;
  }

  // Columns a migration deliberately does not carry. Declaring one is a
  // reviewed decision, not a way to quieten the check: anything not declared
  // still reports as data loss, and a declared column that IS present is
  // compared normally.
  const dropped = new Set(options.intentionallyDropped ?? []);

  const targetTypes = new Map(cb.map((c) => [c.column_name, c.type]));
  const shared = ca.filter(
    (c) => targetTypes.has(c.column_name) && !dropped.has(c.column_name)
  );
  const orphanColumns = ca
    .filter((c) => !targetTypes.has(c.column_name) && !dropped.has(c.column_name))
    .map((c) => c.column_name);

  const pairs = shared.map((c) =>
    comparison(c.column_name, c.type, targetTypes.get(c.column_name))
  );
  const left = pairs.map(([l]) => l).join(",");
  const right = pairs.map(([, r]) => r).join(",");

  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM ${from}) source_rows,
      (SELECT count(*)::int FROM ${to}) target_rows,
      (SELECT count(*)::int FROM ${from} e
        WHERE NOT EXISTS (SELECT 1 FROM ${to} t WHERE t.id = e.id)) missing_from_target,
      (SELECT count(*)::int FROM ${to} t
        WHERE NOT EXISTS (SELECT 1 FROM ${from} e WHERE e.id = t.id)) only_in_target,
      (SELECT count(*)::int FROM ${from} e JOIN ${to} t USING (id)
        WHERE (${left}) IS DISTINCT FROM (${right})) differing
  `);
  const r = rows[0];

  const lost = r.missing_from_target > 0 || r.differing > 0 || orphanColumns.length > 0;
  const ahead = r.only_in_target > 0;

  console.log(`${from} -> ${to}`);
  console.log(`   columns compared:     ${shared.length} of ${ca.length}`);
  console.log(`   rows:                 ${r.source_rows} source, ${r.target_rows} target`);
  console.log(`   missing from target:  ${r.missing_from_target}`);
  console.log(`   differing values:     ${r.differing}`);
  console.log(`   only in target:       ${r.only_in_target}`);

  if (orphanColumns.length) {
    console.log(`   DATA LOSS RISK: no home in target for ${orphanColumns.join(", ")}`);
  }
  if (lost) {
    console.log(`   >> NOT SAFE: the target does not contain everything the source has`);
  }
  if (ahead) {
    console.log(`   >> DO NOT BACKFILL: the target holds ${r.only_in_target} row(s) the source`);
    console.log(`      does not. A backfill would overwrite them with stale values.`);
    console.log(`      This is expected once a *_SOURCE switch has been promoted past dual.`);
  }
  if (dropped.size) {
    console.log(
      `   dropped on purpose: ${[...dropped].join(", ")}  (${options.reason ?? "no reason given"})`
    );
  }
  if (!lost && !ahead) {
    console.log(`   ok: identical`);
  }
  console.log();
  return !lost && !ahead;
}

const [from, to] = process.argv.slice(2);
const pairs = from && to ? [[from, to]] : PAIRS;

let allClean = true;
for (const [a, b, options] of pairs) {
  if (!(await verify(a, b, options))) allClean = false;
}

console.log(allClean ? "all pairs identical" : "review the warnings above before migrating");
if (!allClean) process.exitCode = 1;
await pool.end();
