// Compares a table in the live `exchange` schema against its counterpart in the
// domain-namespaced schema it is moving to.
//
// Reports the three things that decide how much work a feature's migration is:
// which columns differ, which defaults differ, and how far the data has drifted
// since the January copy. Column defaults are included because a response diff
// caught leads diverging on exactly that, and nothing else would have.
//
// Read-only.
//
//   node scripts/compare-tables.mjs exchange.leads leads.leads
//   node scripts/compare-tables.mjs            (compares a built-in list)
import "dotenv/config";
import pool from "#db";

// The mapping as far as it is known. Extend as features are moved.
const PAIRS = [
  ["exchange.leads", "leads.leads"],
  ["exchange.reviews", "reviews.reviews"],
  ["exchange.rates", "rates.rates"],
  ["exchange.metals", "metals.metals"],
  ["exchange.mints", "products.mints"],
  ["exchange.images", "media.images"],
  ["exchange.addresses", "orders.addresses"],
  ["exchange.purchase_orders", "orders.orders"],
  ["exchange.shipments", "shipping.shipments"],
  ["exchange.carriers", "shipping.carriers"],
  ["exchange.carrier_services", "shipping.services"],
  ["exchange.carrier_pickups", "shipping.pickups"],
  ["exchange.tracking_events", "shipping.tracking"],
  ["exchange.sales_tax_rules", "tax.sales_tax_rules"],
  ["exchange.state_sales_tax", "tax.sales_tax"],
];

const split = (q) => {
  const [schema, table] = q.split(".");
  return { schema, table };
};

async function columns(schema, table) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  return rows;
}

async function count(schema, table) {
  try {
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM "${schema}"."${table}"`
    );
    return rows[0].n;
  } catch {
    return null;
  }
}

async function compare(from, to) {
  const a = split(from);
  const b = split(to);

  const [ca, cb] = [await columns(a.schema, a.table), await columns(b.schema, b.table)];
  if (!ca.length || !cb.length) {
    console.log(`${from} -> ${to}`);
    console.log(`   ${!ca.length ? from : to} does not exist\n`);
    return;
  }

  const na = ca.map((c) => c.column_name);
  const nb = cb.map((c) => c.column_name);
  const onlyFrom = na.filter((c) => !nb.includes(c));
  const onlyTo = nb.filter((c) => !na.includes(c));

  const typeDiffs = [];
  const defaultDiffs = [];
  for (const name of na.filter((c) => nb.includes(c))) {
    const x = ca.find((c) => c.column_name === name);
    const y = cb.find((c) => c.column_name === name);
    if (x.data_type !== y.data_type || x.is_nullable !== y.is_nullable) {
      typeDiffs.push(`${name}: ${x.data_type}/${x.is_nullable} -> ${y.data_type}/${y.is_nullable}`);
    }
    if ((x.column_default ?? null) !== (y.column_default ?? null)) {
      defaultDiffs.push(`${name}: ${x.column_default ?? "none"} -> ${y.column_default ?? "none"}`);
    }
  }

  const [ra, rb] = [await count(a.schema, a.table), await count(b.schema, b.table)];
  const effort = onlyFrom.length + onlyTo.length + typeDiffs.length + defaultDiffs.length;

  console.log(`${from} -> ${to}   rows ${ra} vs ${rb}   ${effort === 0 ? "IDENTICAL SHAPE" : effort + " difference(s)"}`);
  if (onlyFrom.length) console.log(`   missing from target: ${onlyFrom.join(", ")}`);
  if (onlyTo.length) console.log(`   extra in target:     ${onlyTo.join(", ")}`);
  for (const d of typeDiffs) console.log(`   type/nullability:    ${d}`);
  for (const d of defaultDiffs) console.log(`   default:             ${d}`);
  console.log();
}

const [from, to] = process.argv.slice(2);
if (from && to) {
  await compare(from, to);
} else {
  for (const [a, b] of PAIRS) await compare(a, b);
}
await pool.end();
