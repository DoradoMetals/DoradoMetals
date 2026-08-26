// EVERY ADMIN UPDATE MUTATION POSTS TO A ROUTE THAT READS WHAT IT SENDS.
//
// useUpdatePoolRemediation posted to /purchase_orders/update_pool_oz_deducted
// with a body of { purchase_order_id, pool_remediation }. That route's service
// destructures `pool_oz_deducted`, which the body does not contain - so the
// value arrived as undefined, pg wrote NULL, and the remediation was never
// saved anywhere. Two money fields wrong in one click: the one being edited was
// discarded and a different one was erased.
//
// WHAT MASKED IT. exchange.purchase_orders in PRODUCTION has neither
// pool_oz_deducted nor pool_remediation - migration 033 adds them and no
// migration has been applied there. So both pool routes answer 500 today
// (42703, column does not exist) and nothing is written at all. The wipe is
// armed by a migration rather than happening now, which is exactly the kind of
// thing worth catching before the schema catches up.
//
// The check is deliberately NOT "the route name matches the field name" - that
// rule is wrong twice over here. /update_shipping_actual reads
// `shipping_fee_actual`, and /update_refiner_premium takes an item_id as well.
// The API service is the authority on what each route reads.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.cwd(), "..");
const QUERIES = path.join(
  REPO,
  "frontend/features/orders/purchaseOrders/admin/queries.ts"
);
const SERVICE = path.join(process.cwd(), "features/purchase-orders/service.ts");

// `export async function updatePoolRemediation({ purchase_order_id,
//   pool_remediation, }: {` -> the keys the service reads.
const serviceReads = (src) => {
  const map = new Map();
  for (const m of src.matchAll(
    /export async function (\w+)\(\s*\{([^}]*)\}\s*:/g
  )) {
    const keys = m[2]
      .split(",")
      .map((k) => k.trim().split(/[:=]/)[0].trim())
      .filter((k) => /^[a-z_][a-z0-9_]*$/.test(k));
    map.set(m[1], keys);
  }
  return map;
};

// /purchase_orders/update_pool_remediation -> updatePoolRemediation
const handlerFor = (url) =>
  url
    .split("/")
    .pop()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^update/, "update");

test("every admin purchase-order mutation sends a key its route reads", () => {
  const queries = fs.readFileSync(QUERIES, "utf8");
  const reads = serviceReads(fs.readFileSync(SERVICE, "utf8"));

  const calls = [
    ...queries.matchAll(
      /apiRequest\('POST', '(\/purchase_orders\/update_[a-z_]+)', \{([^}]*)\}/g
    ),
  ];
  assert.ok(
    calls.length >= 5,
    `only ${calls.length} admin update mutation(s) found - the walk is wrong, ` +
      "and a check that reads nothing accepts everything"
  );

  const wrong = [];
  let checked = 0;
  for (const c of calls) {
    const [url, body] = [c[1], c[2]];
    const sent = body
      .split(",")
      .map((k) => k.trim().split(":")[0].trim())
      .filter((k) => k && k !== "purchase_order_id");
    if (!sent.length) continue;

    const handler = handlerFor(url);
    const wanted = reads.get(handler);
    // A route whose service takes something other than a destructured object
    // is not this check's business.
    if (!wanted) continue;
    checked += 1;

    const unread = sent.filter((k) => !wanted.includes(k));
    if (unread.length) {
      wrong.push(
        `${url} sends [${sent.join(", ")}] but ${handler} reads [${wanted.join(", ")}]`
      );
    }
  }

  assert.ok(checked >= 4, `only ${checked} mutation(s) matched a service`);
  assert.deepEqual(
    wrong,
    [],
    "a mutation is posting a field its route does not read - the value is " +
      "silently dropped and whatever the route DOES read becomes NULL"
  );
  console.log(`      ${checked} admin mutation(s) checked against the service they call`);
});
