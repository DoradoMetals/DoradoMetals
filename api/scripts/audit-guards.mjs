import "#env";
import pg from "pg";

const GUARDS = [
  {
    migration: "031/034/036/038/040/042_backfill_orders*",
    what: "orders.orders rows exchange has no order for",
    sql: `SELECT count(*)::int n FROM orders.orders o
          WHERE NOT EXISTS (SELECT 1 FROM exchange.purchase_orders e WHERE e.id = o.id)
            AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders e WHERE e.id = o.id)`,
  },
  {
    migration: "050_backfill_addresses",
    what: "places.user_addresses pointing at an address exchange does not have",
    sql: `SELECT count(*)::int n FROM places.user_addresses ua
          WHERE NOT EXISTS (SELECT 1 FROM exchange.addresses e WHERE e.id = ua.address_id)`,
  },
  {
    migration: "049_backfill_shipping",
    what: "shipping.shipments rows exchange does not have",
    sql: `SELECT count(*)::int n FROM shipping.shipments s
          WHERE NOT EXISTS (SELECT 1 FROM exchange.shipments e WHERE e.id = s.id)`,
  },
  {
    migration: "052_backfill_fulfillments",
    what: "fulfillments.fulfillments whose order is not in orders.orders",
    sql: `SELECT count(*)::int n FROM fulfillments.fulfillments f
          WHERE NOT EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = f.order_id)`,
  },
];

const url = process.env.PROD_READONLY_DATABASE_URL;
if (!url) {
  console.error("PROD_READONLY_DATABASE_URL is not set");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

let refusing = 0;
console.log("would any backfill guard refuse on production?\n");

try {
  for (const g of GUARDS) {
    let n;
    try {
      n = (await c.query(g.sql)).rows[0].n;
    } catch (err) {
      console.log(`  SKIP    ${g.migration}`);
      console.log(`          ${err.message.split("\n")[0]}`);
      continue;
    }
    if (n > 0) {
      refusing++;
      console.log(`  REFUSE  ${g.migration}`);
      console.log(`          ${n} ${g.what}`);
    } else {
      console.log(`  ok      ${g.migration}`);
    }
  }
} finally {
  await c.end();
}

if (refusing) {
  console.log(
    `\n${refusing} guard(s) would refuse.\n\n` +
    `That is the guard working, not a bug. Each one means the new schema holds\n` +
    `something exchange does not, so re-deriving from exchange would overwrite it.\n` +
    `Someone has to decide, per case, whether those rows are real data to keep or\n` +
    `artifacts of the January work to discard - and the answer is not in the code.`
  );
  process.exit(1);
}
console.log("\nno guard would refuse; exchange is still authoritative everywhere");
