import "#env";
import pg from "pg";
import pool from "#pool";

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
    `SELECT payment_intent_id, payment_status, amount, amount_received, type,
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

  console.log("\nmoney Stripe captured that exchange has no record of receiving:\n");

  let unrecorded = 0;
  let unrecordedTotal = 0;
  for (const c of settled) {
    const row = byId.get(c.payment_intent_id);
    if (!row) continue;
    const received = Number(row.amount_received ?? 0);
    if (received > 0) continue;
    unrecorded++;
    unrecordedTotal += Number(c.amount);
    console.log(
      `  ${c.payment_intent_id}  Stripe $${c.amount}  ` +
      `exchange amount_received=${row.amount_received ?? "null"} status=${row.payment_status}`
    );
  }
  if (!unrecorded) {
    console.log("  none - every settled charge is recorded as received");
  } else {
    console.log(
      `\n  ${unrecorded} of ${settled.length} settled charges, $${unrecordedTotal.toFixed(2)} in total.`
    );
    console.log(
      "  The new schema has a settlement for each: 074 derives them from this"
    );
    console.log(
      "  export rather than from whatever the webhook last managed to write."
    );
  }

  const customerIds = [...new Set(charges.map((c) => c.stripe_customer_id).filter(Boolean))];
  const { rows: users } = await prod.query(
    `SELECT id, "stripeCustomerId" AS cus FROM exchange.users WHERE "stripeCustomerId" = ANY($1)`,
    [customerIds]
  );
  const userByCustomer = new Map(users.map((u) => [u.cus, u.id]));

  console.log("\nwho paid, and for what:\n");

  let unattributed = 0;
  for (const c of settled) {
    const userId = userByCustomer.get(c.stripe_customer_id) ?? null;
    const short = (id) => `${id.slice(0, 8)}…`;

    if (!userId) {
      unattributed++;
      console.log(`  ${c.payment_intent_id}  $${c.amount}`);
      console.log(`          no exchange user carries ${c.stripe_customer_id}`);
      continue;
    }

    const { rows: orders } = await prod.query(
      `SELECT order_number, order_total, sales_order_status
       FROM exchange.sales_orders WHERE user_id = $1 ORDER BY created_at`,
      [userId]
    );

    const near = (o) =>
      o.order_total == null ? Infinity
      : Math.abs(Number(o.order_total) - Number(c.amount)) / Math.max(Number(c.amount), 0.01);

    const ranked = [...orders].sort((a, b) => near(a) - near(b));
    const best = ranked[0];
    const exact = best && near(best) * Number(c.amount) < 0.01;
    const likely = best && !exact && near(best) < 0.01;
    const match = exact || likely ? best : null;

    console.log(`  ${c.payment_intent_id}  $${c.amount}  ${c.status}`);
    if (match) {
      const how = exact ? "->" : "~~>";
      console.log(
        `          user ${short(userId)}  ${how}  order #${match.order_number} ` +
        `($${Number(match.order_total).toFixed(2)}, ${match.sales_order_status})` +
        (likely ? `  [within 1%, not exact]` : "")
      );
    } else if (orders.length) {
      unattributed++;
      console.log(`          user ${short(userId)}  ->  ${orders.length} order(s), none matching this amount:`);
      console.log(`          ${orders.map((o) => `#${o.order_number} $${Number(o.order_total ?? 0).toFixed(2)}`).join(", ")}`);
    } else {
      unattributed++;
      console.log(`          user ${short(userId)}  ->  no sales orders at all`);
    }
  }

  console.log(
    `\n${settled.length - unattributed} of ${settled.length} settled payment(s) can be tied to a specific order.\n` +
    `\`->\` is an exact amount match, \`~~>\` is within one percent and wants a human to confirm it.`
  );

  const linked = intents.filter((r) => r.sales_order_id || r.purchase_order_id).length;
  console.log(`of production's ${intents.length} intents, ${linked} link to an order`);

  const unknown = charges.filter((c) => !byId.has(c.payment_intent_id)).length;
  console.log(`${unknown} intent(s) in the Stripe export have no row in exchange at all`);

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
