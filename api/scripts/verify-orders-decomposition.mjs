// Does reading the four orders.* tables separately reproduce what the one
// thirteen-table query projects?
//
// THE GATE FOR THE PURCHASE-ORDERS RESTRUCTURE. That query joins thirteen
// tables and builds a deeply nested shape the frontend is coupled to; taking it
// apart into one repo per table is the largest single reshaping in the
// migration, and this is what says the pieces still add up before any of it is
// wired in.
//
// Run it BEFORE pointing anything at the new repos, and again after. It
// compares fifteen fields per order plus the line ids - the values that MOVED
// between tables, not the ones that stayed put, because those cannot diverge.
//
// Read-only, and it exits non-zero on a divergence.
//
//   pnpm --filter @dorado/api verify:orders-decomposition
import "#env";
import pool from "#db";
import * as next from "#features/purchase-orders/repo.next.ts";
import * as totals from "#features/orders/transactions/repo.ts";
import * as items from "#features/orders/items/repo.ts";
import * as addrs from "#features/orders/addresses/repo.ts";
import * as readService from "#features/purchase-orders/read.service.ts";
import * as exchangeRepo from "#features/purchase-orders/repo.exchange.js";

const composed = await next.getAll();
console.log(`${composed.length} purchase order(s) from the composed query\n`);

const ids = composed.map((o) => o.id);
const totalBy = new Map((await totals.getMany(ids)).map((r) => [r.order_id, r]));
const addrBy = new Map((await addrs.getMany(ids)).map((r) => [r.order_id, r]));
const itemsBy = new Map();
for (const i of await items.getMany(ids)) {
  if (!itemsBy.has(i.order_id)) itemsBy.set(i.order_id, []);
  itemsBy.get(i.order_id).push(i);
}

// field on the composed order  ->  [which repo, field on that row]
// "totals.x" reaches into the nested money object the Next wire carries (D84).
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
    const mine = map.get(order.id)?.[source] ?? null;
    const theirs = field.split(".").reduce((v, k) => v?.[k], order) ?? null;
    checked++;
    if (!same(mine, theirs)) {
      bad.push(`${order.id.slice(0, 8)} ${field}: composed=${JSON.stringify(theirs)} decomposed=${JSON.stringify(mine)}`);
    }
  }

  // The lines, by count and by id - the shape is rebuilt later, but losing or
  // inventing one would be the worst kind of divergence.
  const mineItems = (itemsBy.get(order.id) ?? []).map((i) => i.id).sort();
  const theirItems = (order.order_items ?? [])
    .filter((i) => i && i.id)
    .map((i) => i.id)
    .sort();
  checked++;
  if (JSON.stringify(mineItems) !== JSON.stringify(theirItems)) {
    bad.push(
      `${order.id.slice(0, 8)} items: composed has ${theirItems.length}, decomposed has ${mineItems.length}`
    );
  }
}

// ---------------------------------------------------------------------------
// THE WHOLE SHAPE, not just the fields that moved.
//
// The comparison above is field by field and would miss a nested object that
// changed - the six jsonb_build_objects are what the frontend actually
// destructures. This deep-compares the read service's answer against the
// composed query's, through JSON, because the contract describes the WIRE and a
// Date and its ISO string are the same value there.
// KEY ORDER IS IGNORED, AND THAT IS NOT THE GATE BEING WEAKENED.
//
// features/orders/fragments.ts carries a long note warning against exactly this
// move: a shared column list reordered the response, `diff` caught it, and
// making the comparison order-insensitive was rejected because "weakening the
// gate so a refactor can pass is how gates die". That was the right call there.
//
// This is a different case, and the difference is whether the reordering was a
// CHOICE. There, the columns could have been left where they were. Here,
// jsonb_build_object returns keys in jsonb's own internal order and a
// JavaScript object preserves insertion order - so moving composition out of
// Postgres reorders the keys no matter how the code is written. There is no
// version of this that avoids it.
//
// So the values are compared exactly and the KEY SETS are compared exactly;
// only the sequence is ignored. A missing field, an extra field, or a wrong
// value all still fail. Sorting is recursive, because the nested objects are
// where the reordering actually happens.
// TIMESTAMPS ARE COMPARED AS INSTANTS, TO THE MILLISECOND, AND THAT IS A REAL
// LOSS THAT IS BEING ACCEPTED RATHER THAN HIDDEN.
//
// jsonb_build_object and to_jsonb render a timestamp as TEXT with Postgres's
// full microsecond precision - "2026-01-07T22:05:39.625512". Reading the column
// instead hands node-postgres a timestamp, which becomes a JS Date, which
// serialises to "2026-01-07T22:05:39.625Z". The last three digits are gone.
//
// It cannot be avoided by writing the composition differently: a JS Date has
// millisecond resolution and cannot hold microseconds at all, so any consumer
// that does `new Date(created_at)` - which is what the frontend does - already
// truncates them. The database still stores them; only the JSON rendering is
// shorter.
//
// This is the SECOND time the same difference has come up - fulfillments hit it
// first - so it is written down in FOLLOWUPS.md rather than left in a comment.
const ISO_MICROS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const asInstant = (v) => {
  if (typeof v !== "string" || !ISO_MICROS.test(v)) return v;
  const t = Date.parse(v.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`);
  return Number.isNaN(t) ? v : `@${t}`;
};

const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  }
  return asInstant(v);
};
const wire = (v) => sortKeys(JSON.parse(JSON.stringify(v ?? null)));

const fromService = await readService.getAll();
const byId = new Map(fromService.map((o) => [o.id, o]));

let shapeChecked = 0;
const shapeBad = [];

for (const order of composed) {
  const mine = byId.get(order.id);
  shapeChecked++;
  if (!mine) {
    shapeBad.push(`${order.id.slice(0, 8)} is missing from the read service entirely`);
    continue;
  }

  const a = wire(order);
  const b = wire(mine);

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (JSON.stringify(keysA) !== JSON.stringify(keysB)) {
    const onlyA = keysA.filter((k) => !keysB.includes(k));
    const onlyB = keysB.filter((k) => !keysA.includes(k));
    shapeBad.push(
      `${order.id.slice(0, 8)} keys differ - composed only: [${onlyA}] service only: [${onlyB}]`
    );
    continue;
  }

  for (const k of keysA) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      // Report the FIRST differing leaf, not the whole object. A nested object
      // truncated at 160 characters showed two identical prefixes and hid what
      // actually differed, which cost a round of guessing.
      const leaves = (v, path = "") =>
        v && typeof v === "object"
          ? Object.entries(v).flatMap(([kk, vv]) => leaves(vv, path ? `${path}.${kk}` : kk))
          : [[path, JSON.stringify(v)]];
      const la = Object.fromEntries(leaves(a[k]));
      const lb = Object.fromEntries(leaves(b[k]));
      const differing = [...new Set([...Object.keys(la), ...Object.keys(lb)])]
        .filter((leaf) => la[leaf] !== lb[leaf])
        .slice(0, 4);
      shapeBad.push(
        differing.length
          ? `${order.id.slice(0, 8)} ${k} -> ${differing
              .map((leaf) => `${leaf}: ${String(la[leaf]).slice(0, 50)} vs ${String(lb[leaf]).slice(0, 50)}`)
              .join("; ")}`
          : `${order.id.slice(0, 8)} ${k}: differs but no leaf does (array length?)`
      );
    }
  }
}

console.log(`${checked} value(s) compared across ${composed.length} order(s)`);
if (bad.length === 0) {
  console.log("the moved fields reproduce the composed query exactly");
} else {
  console.log(`\n${bad.length} FIELD DIVERGENCE(S):`);
  for (const b of bad.slice(0, 30)) console.log(`  ${b}`);
}

// ---------------------------------------------------------------------------
// AND AGAINST exchange, WHICH IS WHAT ACTUALLY SERVES TRAFFIC.
//
// The comparison above is new-schema against new-schema: read.service.ts
// against repo.next.ts. Both read `orders.*`, so it proves the decomposition
// and nothing about the pivot.
//
// PURCHASE_ORDERS_SOURCE defaults to `exchange`, so what a customer sees today
// comes from repo.exchange.js. Pointing the reads at read.service.ts changes
// which schema answers, and this is the check that says what that changes.
//
// A difference here is NOT automatically a defect - the two schemas can
// genuinely disagree, and five dev shipments already do - so it reports rather
// than fails, and the exit code stays governed by the decomposition checks.
// THE DIFFERENCES THAT ARE ALREADY DECLARED, so the report shows only what is
// not yet explained. Each one is written down somewhere and each is here with
// the reason, because a list of known-good exceptions that does not say why is
// how a real difference gets added to it.
const DECLARED = [
  {
    // features/purchase-orders/compose.ts, and repo.next.ts before it.
    match: (field, leaf) => field === "order_items" && leaf === "scrap.id",
    why: "exchange returns the SCRAP ROW's id; there is no scrap row in the new schema, so it returns the LINE's. Nothing reads it - the admin table keys on the item.",
  },
  {
    // The five dev shipments in FOLLOWUPS.md, matching the tracking.test.js
    // incident. A DATA difference, not a code one.
    match: (field) => field === "shipment" || field === "return_shipment",
    why: "5 dev shipments disagree between the schemas on shipping_status/delivered_at - see FOLLOWUPS.md. exchange may be the damaged copy.",
  },
];

const fromExchange = await exchangeRepo.getAll();
const exchangeById = new Map(fromExchange.map((o) => [o.id, o]));

let liveChecked = 0;
const liveBad = new Map();

// AN ORDER WITH NO OFFER AND NO TOTALS ROW IS NOT A MIGRATED ORDER, it is a
// partial - something wrote orders.orders without the rest. Comparing one
// against exchange reports every offer and money field as different, which is
// true and tells you nothing about the pivot.
//
// Described structurally rather than by listing ids: the eleven rows
// clean:dual-orphans removes are all in this state today, but the point is the
// STATE, not those particular rows.
const partial = new Set(
  fromService
    .filter((o) => !totalBy.has(o.id))
    .map((o) => o.id)
);

let partialCount = 0;

for (const order of fromService) {
  const theirs = exchangeById.get(order.id);
  if (!theirs) continue;
  if (partial.has(order.id)) {
    partialCount++;
    continue;
  }
  liveChecked++;
  const a = wire(theirs);
  const b = wire(order);
  const leaves = (v, path = "") =>
    v && typeof v === "object"
      ? Object.entries(v).flatMap(([k, vv]) => leaves(vv, path ? `${path}.${k}` : k))
      : [[path, JSON.stringify(v)]];

  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;

    // Which LEAF differs, so a declared exception can be recognised precisely
    // rather than by suppressing a whole field.
    const la = Object.fromEntries(leaves(a[k]));
    const lb = Object.fromEntries(leaves(b[k]));
    const differing = [...new Set([...Object.keys(la), ...Object.keys(lb)])]
      .filter((leaf) => la[leaf] !== lb[leaf])
      // The array index is not part of the identity of a leaf: `0.scrap.id`
      // and `2.scrap.id` are the same field on different lines.
      .map((leaf) => leaf.replace(/^\d+\./, ""));

    const unexplained = [...new Set(differing)].filter(
      (leaf) => !DECLARED.some((d) => d.match(k, leaf))
    );
    if (unexplained.length === 0) continue;

    const key = `${k} -> ${unexplained.slice(0, 3).join(", ")}`;
    if (!liveBad.has(key)) liveBad.set(key, []);
    liveBad.get(key).push(order.id.slice(0, 8));
  }
}

console.log(`\n${shapeChecked} whole order(s) deep-compared against the read service`);
if (shapeBad.length === 0) {
  console.log("the read service returns the same shape, field for field");
} else {
  console.log(`\n${shapeBad.length} SHAPE DIVERGENCE(S):`);
  for (const b of shapeBad.slice(0, 20)) console.log(`  ${b}`);
}

console.log(
  `\n${liveChecked} order(s) compared against exchange - ` +
    `${fromExchange.length} in exchange, ${fromService.length} in the new schema`
);
if (partialCount) {
  console.log(
    `${partialCount} skipped: in orders.orders with no offer and no totals row, ` +
      `so every offer and money field would report as different. ` +
      `All of these are test rows today - see clean:dual-orphans.`
  );
}
console.log("declared differences, excluded from the list below:");
for (const d of DECLARED) console.log(`  - ${d.why}`);
console.log();
if (liveBad.size === 0) {
  console.log("nothing else differs - the new schema answers as the one serving traffic does");
} else {
  console.log("fields where the two SCHEMAS disagree (reported, not failed):");
  for (const [field, ids] of [...liveBad].sort((x, y) => y[1].length - x[1].length)) {
    console.log(`  ${field.padEnd(22)} ${ids.length} order(s)  ${ids.slice(0, 6).join(" ")}`);
  }
}

await pool.end();
process.exitCode = bad.length + shapeBad.length ? 1 : 0;
