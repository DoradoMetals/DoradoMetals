// Does THE purchase-order read reproduce what the orders.* tables hold?
//
// DEMOTED with the read pivot (ruling 8), deliberately. This gate's original
// job was to prove the decomposed read against the composed thirteen-table
// query and against exchange before anything was repointed; the pivot landed,
// the composed query and the exchange read implementation are deleted, and
// exchange stopped being an implementation to compare against - it is the
// dual-written recovery copy, checked at the WRITE side by the repo.dual and
// write.service tests.
//
// What survives is the decomposition question itself, now as a REGRESSION
// harness: read.service.ts assembles an order from four tables plus five
// joins, and this proves the values it serves are the values the RAW tables
// hold - field by field for everything that moved between tables, line ids
// exactly.
// A read that silently dropped a table from its assembly passes tsc and
// serves a shape validate:wire accepts (the keys still exist, null); this is
// what catches the VALUES going missing.
//
// Read-only, exits non-zero on a divergence.
//
//   pnpm --filter @dorado/api verify:orders-decomposition
import "#env";
import pool from "#db";
import * as totals from "#features/orders/transactions/repo.ts";
import * as items from "#features/orders/items/repo.ts";
import * as addrs from "#features/orders/addresses/repo.ts";
import * as readService from "#features/orders/read.service.ts";

const composed = await readService.getAllPurchases();
console.log(`${composed.length} purchase order(s) from the read service\n`);

const ids = composed.map((o) => o.id);
const totalBy = new Map((await totals.getMany(ids)).map((r) => [r.order_id, r]));
const addrBy = new Map((await addrs.getMany(ids)).map((r) => [r.order_id, r]));
const itemsBy = new Map();
for (const i of await items.getMany(ids)) {
  if (!itemsBy.has(i.order_id)) itemsBy.set(i.order_id, []);
  itemsBy.get(i.order_id).push(i);
}
const { rows: orderRows } = await pool.query(
  `SELECT id, status, number, user_id, spots_locked
     FROM orders.orders WHERE direction = 'purchase'`
);
const orderBy = new Map(orderRows.map((r) => [r.id, r]));

// field on the served order  ->  [which table, field on that row]
// "totals.x" reaches into the nested money object the wire carries (D84).
// These are the values that MOVED between tables - the ones that stayed put
// cannot diverge.
const FIELDS = [
  ["totals.total", totalBy, "total"],
  ["waive_shipping_fee", totalBy, "waive_shipping_fee"],
  ["waive_payout_fee", totalBy, "waive_payout_fee"],
  ["shipping_paid", totalBy, "shipping_paid"],
  ["shipping_fee_actual", totalBy, "shipping_fee_actual"],
  ["totals.refiner_fee", totalBy, "refiner_fee"],
  ["pool_remediation", totalBy, "pool_remediation"],
  ["pool_oz_deducted", totalBy, "pool_oz_deducted"],
  ["address_id", addrBy, "source_address_id"],
  ["status", orderBy, "status"],
  ["number", orderBy, "number"],
  ["user_id", orderBy, "user_id"],
  ["spots_locked", orderBy, "spots_locked"],
];

const same = (a, b) => {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return String(a) === String(b);
};

let checked = 0;
const bad = [];

for (const order of composed) {
  for (const [field, map, source] of FIELDS) {
    const raw = map.get(order.id)?.[source] ?? null;
    const served = field.split(".").reduce((v, k) => v?.[k], order) ?? null;
    checked++;
    if (!same(raw, served)) {
      bad.push(`${order.id.slice(0, 8)} ${field}: served=${JSON.stringify(served)} raw=${JSON.stringify(raw)}`);
    }
  }

  // The lines, by count and by id - losing or inventing one would be the
  // worst kind of divergence.
  const rawItems = (itemsBy.get(order.id) ?? []).map((i) => i.id).sort();
  const servedItems = (order.order_items ?? [])
    .filter((i) => i && i.id)
    .map((i) => i.id)
    .sort();
  checked++;
  if (JSON.stringify(rawItems) !== JSON.stringify(servedItems)) {
    bad.push(
      `${order.id.slice(0, 8)} items: served has ${servedItems.length}, raw has ${rawItems.length}`
    );
  }
}

// Every purchase order in the table is in the answer - the read must not
// filter, and the table must not hold a direction the read invents.
if (composed.length !== orderRows.length) {
  bad.push(
    `the read served ${composed.length} order(s) but orders.orders holds ${orderRows.length}`
  );
}

console.log(`${checked} value(s) compared across ${composed.length} order(s)`);
if (bad.length === 0) {
  console.log("the read serves exactly what the raw tables hold");
} else {
  console.log(`\n${bad.length} DIVERGENCE(S):`);
  for (const b of bad.slice(0, 30)) console.log(`  ${b}`);
}

await pool.end();
process.exitCode = bad.length ? 1 : 0;
