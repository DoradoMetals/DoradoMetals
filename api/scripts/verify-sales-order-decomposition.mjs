// Does reading a sales order from its own tables reproduce what the composed
// query and what exchange return?
//
// The twin of verify-orders-decomposition.mjs, for the other direction, and it
// exists for the same reason: a sales order is spread over orders.orders,
// orders.transactions, orders.items and orders.addresses, and taking the
// composed query apart is the largest reshaping in this feature.
//
// TWO COMPARISONS, AND THE SECOND IS THE ONE THAT MATTERS FOR THE PIVOT:
//
//   against repo.next.ts     - new schema against new schema. Proves the
//                              decomposition and nothing about the pivot.
//   against EXCHANGE ITSELF   - the projection repo.exchange.js used, kept in
//                              scripts/fixtures/sales-orders-exchange.sql
//                              because that file has been deleted. This is the
//                              one that says whether the new schema and the old
//                              one still agree.
//
// Learned on purchase orders: a gate that only compares new-to-new is answering
// a question nobody asked. And when repo.exchange.js went, pointing this at the
// read service instead made it compare the service WITH ITSELF - which passes
// unconditionally and is worse than having no gate. Hence the fixture.
//
// Read-only, exits non-zero on an unexplained divergence.
//
//   pnpm --filter @dorado/api verify:sales-order-decomposition
import "#env";
import pool from "#db";
import * as nextRepo from "#features/sales-orders/repo.next.ts";
import fs from "node:fs";
import path from "node:path";
import * as readService from "#features/sales-orders/read.service.ts";

// Key order is ignored and timestamps are compared as instants - both are
// forced by composition moving out of Postgres rather than chosen. See the long
// notes in verify-orders-decomposition.mjs.
const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const asInstant = (v) => {
  if (typeof v !== "string" || !ISO.test(v)) return v;
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

const leaves = (v, path = "") =>
  v && typeof v === "object"
    ? Object.entries(v).flatMap(([k, vv]) => leaves(vv, path ? `${path}.${k}` : k))
    : [[path, JSON.stringify(v)]];

function compare(label, expected, actual) {
  const bad = [];
  const byId = new Map(actual.map((o) => [o.id, o]));
  let checked = 0;

  for (const order of expected) {
    const mine = byId.get(order.id);
    if (!mine) {
      bad.push(`${order.id.slice(0, 8)} missing entirely`);
      continue;
    }
    checked++;
    const a = wire(order);
    const b = wire(mine);
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      const la = Object.fromEntries(leaves(a[k]));
      const lb = Object.fromEntries(leaves(b[k]));
      const differing = [...new Set([...Object.keys(la), ...Object.keys(lb)])]
        .filter((leaf) => la[leaf] !== lb[leaf])
        .map((leaf) => leaf.replace(/^\d+\./, ""));
      bad.push(
        `${order.id.slice(0, 8)} ${k} -> ${[...new Set(differing)]
          .slice(0, 3)
          .map((leaf) => `${leaf}: ${String(la[leaf]).slice(0, 45)} vs ${String(lb[leaf]).slice(0, 45)}`)
          .join("; ")}`
      );
    }
  }

  console.log(`\n${label}: ${checked} order(s) compared`);
  if (bad.length === 0) console.log("  identical");
  else for (const b of bad.slice(0, 20)) console.log(`  ${b}`);
  return bad.length;
}

const fromService = await readService.getAll();
const fromNext = await nextRepo.getAll();
const exchangeSql = fs.readFileSync(
  path.join(import.meta.dirname, "fixtures", "sales-orders-exchange.sql"),
  "utf8"
);
const fromExchange = (await pool.query(exchangeSql)).rows;

console.log(
  `${fromService.length} from the read service, ${fromNext.length} from the composed query, ` +
    `${fromExchange.length} from exchange`
);

let failures = 0;
failures += compare("against the composed query (new schema vs new schema)", fromNext, fromService);
failures += compare(
  "against exchange - WHAT SERVES TRAFFIC TODAY",
  fromExchange,
  fromService
);

await pool.end();
process.exitCode = failures ? 1 : 0;
