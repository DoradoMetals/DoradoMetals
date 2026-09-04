import "#env";
import pool from "#pool";

const PAIRS = [
  ["exchange.leads", "leads.leads"],
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
  ["exchange.suppliers", "refiners.exchange_compat"],
  ["exchange.carriers", "shipping.carriers_exchange_compat"],
  ["exchange.mints", "products.mints_exchange_compat"],
  [
    "exchange.images",
    "media.images",
    {
      intentionallyDropped: ["checksum_sha256"],
      reason: "renamed to checksum; value compared by the media diff",
    },
  ],
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
  [
    "exchange.carts",
    "checkout.checkouts",
    {
      intentionallyDropped: ["id"],
      reason:
        "the checkout row gets a fresh uuid; a cart is looked up by user, never by id",
    },
  ],
  [
    "exchange.sell_carts",
    "checkout.checkouts",
    {
      intentionallyDropped: ["id"],
      reason:
        "same, and both directions share one target - checkout.checkouts is UNIQUE (user_id, direction), so only_in_target counts the other direction's rows too",
    },
  ],
  [
    "exchange.cart_items",
    "checkout.items",
    {
      intentionallyDropped: ["id", "cart_id", "product_id"],
      reason:
        "cart_id -> checkout_id, product_id -> bullion_id (declared in feature-map); the id is not carried",
    },
  ],
  [
    "exchange.sell_cart_items",
    "checkout.items",
    {
      intentionallyDropped: ["id", "cart_id", "product_id", "scrap_id", "gross_unit"],
      reason:
        "cart_id -> checkout_id, product_id -> bullion_id, gross_unit -> unit; scrap_id has no successor because the scrap VALUES sit on the item",
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
  return rows.map((r) => ({
    column_name: r.column_name,
    type:
      r.data_type === "USER-DEFINED" ? `${r.udt_schema}.${r.udt_name}` : r.data_type,
  }));
}

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
    return null;
  }

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
let comparedPairs = 0;
for (const [a, b, options] of pairs) {
  const clean = await verify(a, b, options);
  if (clean !== null) comparedPairs += 1;
  if (!clean) allClean = false;
}

const PAIR_FLOOR = Number(process.env.VERIFY_PARITY_FLOOR ?? (from && to ? 1 : 12));
if (comparedPairs < PAIR_FLOOR) {
  console.error(
    `verify:parity compared only ${comparedPairs} pair(s), expected at least ${PAIR_FLOOR}. ` +
      `A backfill is only safe while the old schema is authoritative, and this is the ` +
      `evidence for that; a comparison of nothing exits 0 and reads as agreement.`
  );
  process.exit(1);
}

console.log(allClean ? "all pairs identical" : "review the warnings above before migrating");
if (!allClean) process.exitCode = 1;
await pool.end();
