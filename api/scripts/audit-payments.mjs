// Compares what the database believes about payments against what Stripe says.
//
// exchange.payment_intents is written at intent creation and updated from
// Stripe's response. When that update does not land - a webhook missed, a
// browser closed mid-checkout, a payment completed somewhere other than the
// app - the row keeps whatever status it had, and nothing ever notices, because
// the order lifecycle does not consult this table.
//
// So the two records drift, and until there was something to compare against
// there was no way to see it. payments.stripe_charges is that something.
//
// Reads production's intents (read-only) and the reconciliation table seeded by
// 055. The reconciliation is production's Stripe export regardless of which
// database currently holds it, which is why the two halves can come from
// different places while the comparison still means something.
//
//   node scripts/audit-payments.mjs
//
// Read-only everywhere. Exits non-zero if the two disagree about any settled
// payment, because that is money the application cannot account for.
import "#env";
import pg from "pg";
import pool from "#db";

// Stripe statuses that mean money actually moved.
const SETTLED = new Set(["Paid", "Refunded", "Partially Refunded"]);

const prodUrl = process.env.PROD_READONLY_DATABASE_URL;
if (!prodUrl) {
  console.error("PROD_READONLY_DATABASE_URL is not set");
  process.exit(1);
}

const prod = new pg.Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
await prod.connect();
const local = await pool.connect();

let disagreements = 0;

try {
  const { rows: charges } = await local.query(
    `SELECT payment_intent_id, charge_id, status, amount, amount_refunded, fee,
            stripe_customer_id, created_at
     FROM payments.stripe_charges ORDER BY created_at DESC`
  );
  if (!charges.length) {
    console.error("payments.stripe_charges is empty - run migration 055 first");
    process.exit(1);
  }

  const { rows: intents } = await prod.query(
    `SELECT payment_intent_id, payment_status, amount, type,
            sales_order_id, purchase_order_id, user_id
     FROM exchange.payment_intents`
  );
  const byId = new Map(intents.map((r) => [r.payment_intent_id, r]));

  console.log(`Stripe export: ${charges.length} intents`);
  console.log(`production:    ${intents.length} rows in exchange.payment_intents\n`);

  const settled = charges.filter((c) => c.charge_id && SETTLED.has(c.status));
  console.log(`money moved ${settled.length} time(s). what does the database say?\n`);

  for (const c of settled) {
    const row = byId.get(c.payment_intent_id);
    const db = row ? row.payment_status : null;
    const agrees = db === "succeeded";
    if (!agrees) disagreements++;

    // exchange stores cents, the export dollars.
    const dbAmount = row?.amount == null ? null : Number(row.amount) / 100;
    const amountNote =
      dbAmount == null ? "no amount recorded"
      : Math.abs(dbAmount - Number(c.amount)) > 0.005 ? `amount differs: db $${dbAmount}`
      : "amount agrees";

    console.log(
      `  ${agrees ? "ok    " : "DIFFER"}  ${c.payment_intent_id}`
    );
    console.log(
      `          stripe ${c.status.padEnd(9)} $${String(c.amount).padEnd(9)}` +
      `  database ${db === null ? "(no row at all)" : db}`
    );
    if (!agrees) console.log(`          ${amountNote}`);
  }

  // Orders are what a payment is *for*, and most intents are not attached to one.
  const linked = intents.filter((r) => r.sales_order_id || r.purchase_order_id).length;
  console.log(`\nof production's ${intents.length} intents, ${linked} link to an order`);

  const unknown = charges.filter((c) => !byId.has(c.payment_intent_id)).length;
  console.log(`${unknown} intent(s) in the Stripe export have no row in exchange at all`);

  // The customer link exists and is usable: exchange.users carries the Stripe id.
  const { rows: [cust] } = await prod.query(
    `SELECT count(*)::int total, count("stripeCustomerId")::int linked FROM exchange.users`
  );
  console.log(`${cust.linked} of ${cust.total} users carry a stripeCustomerId, so charges can be attributed`);
} finally {
  local.release();
  await pool.end();
  await prod.end();
}

if (disagreements) {
  console.log(
    `\n${disagreements} settled payment(s) the database does not record as succeeded.\n\n` +
    `Money moved and the application does not know it. This is independent of any\n` +
    `schema migration - it is the current system being wrong - but it is also why\n` +
    `payments cannot be migrated by deriving from exchange alone: the derivation\n` +
    `would faithfully reproduce the error.`
  );
  process.exit(1);
}
console.log("\nthe database agrees with Stripe about every settled payment");
