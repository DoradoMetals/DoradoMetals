// Does THE sales-order read reproduce what the orders.* tables hold?
//
// The twin of verify-orders-decomposition.mjs, for the other direction, and
// DEMOTED the same way (ruling 8): the composed query it compared against and
// the exchange fixture it replayed are both retired - exchange is the
// dual-written recovery copy, checked at the WRITE side by repo.dual.test.js
// and the write.service tests, not an implementation to diff a read against.
//
// What survives is the decomposition question as a REGRESSION harness:
// read.service.ts assembles a sales order from four tables, and this proves
// the values it serves are the values the RAW tables hold - the money field
// by field, the address link, the engagement-owned supplier, the line ids.
//
// Read-only, exits non-zero on a divergence.
//
//   pnpm --filter @dorado/api verify:sales-order-decomposition
import "#env";
import pool from "#db";
import * as totals from "#features/orders/transactions/repo.ts";
import * as items from "#features/orders/items/repo.ts";
import * as addrs from "#features/orders/addresses/repo.ts";
import * as readService from "#features/orders/read.service.ts";

const composed = await readService.getAllSales();
console.log(`${composed.length} sales order(s) from the read service\n`);

const ids = composed.map((o) => o.id);
const totalBy = new Map((await totals.getMany(ids)).map((r) => [r.order_id, r]));
const addrBy = new Map((await addrs.getMany(ids)).map((r) => [r.order_id, r]));
const itemsBy = new Map();
for (const i of await items.getMany(ids)) {
  if (!itemsBy.has(i.order_id)) itemsBy.set(i.order_id, []);
  itemsBy.get(i.order_id).push(i);
}
const { rows: engagements } = await pool.query(
  `SELECT id, order_id, refiner_id FROM refiners.orders`
);
const engagementBy = new Map(engagements.map((r) => [r.order_id, r]));
const { rows: orderRows } = await pool.query(
  `SELECT id, status, number, user_id, order_sent, tracking_updated
     FROM orders.orders WHERE direction = 'sale'`
);
const orderBy = new Map(orderRows.map((r) => [r.id, r]));

// The values that MOVED between tables. totals.refiner_fee is deliberately
// absent: the wire serves NULL for a sales order whatever the column holds -
// see features/orders/compose.ts.
const FIELDS = [
  ["totals.total", totalBy, "total"],
  ["totals.items", totalBy, "items"],
  ["totals.shipping", totalBy, "shipping"],
  ["totals.surcharge", totalBy, "surcharge"],
  ["totals.sales_tax", totalBy, "sales_tax"],
  ["totals.funds", totalBy, "funds"],
  ["totals.base_total", totalBy, "base_total"],
  ["totals.subject_to_charges_amount", totalBy, "subject_to_charges_amount"],
  ["totals.post_charges_amount", totalBy, "post_charges_amount"],
  ["shipping_service", totalBy, "shipping_service"],
  ["used_funds", totalBy, "used_funds"],
  ["address_id", addrBy, "source_address_id"],
  ["status", orderBy, "status"],
  ["number", orderBy, "number"],
  ["user_id", orderBy, "user_id"],
  ["order_sent", orderBy, "order_sent"],
  ["tracking_updated", orderBy, "tracking_updated"],
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

  // The engagement (093) owns which refinery has the order - the wire's
  // supplier_id must be the engagement's refiner_id. (The engagement's OWN id
  // is deliberately not on the wire - by-order addressing serves it.)
  const engagement = engagementBy.get(order.id);
  checked += 1;
  if (!same(order.supplier_id ?? null, engagement?.refiner_id ?? null)) {
    bad.push(
      `${order.id.slice(0, 8)} supplier_id: served=${order.supplier_id} raw=${engagement?.refiner_id ?? null}`
    );
  }

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
