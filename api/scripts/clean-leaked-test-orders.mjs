// Removes the leaked test orders from DEV. RUN, 2026-08-29, approved by Jacob
// ("Yes but don't need a backup to delete from dev. It's just dev.").
//
// WHAT IT REMOVED: 27 orders.orders rows, with 16 orders.items, 24
// orders.transactions, 27 refiners.orders and 16 refiners.items. Nothing in
// `exchange` - by construction, since the set is DEFINED as the orders that
// have no exchange row.
//
// WHY THEY WERE THERE: the audit:test-leaks hazard. A test calls a service,
// the service opens its own transaction on its own connection and commits,
// and the test's rollback does not reach it. All 27 were Pending purchases
// arriving in bursts of three - one per fixture-building test - across eight
// runs on 2026-08-27 and 2026-08-28. clean-dual-run-orphans.mjs describes the
// same shape and covered six of them; it was written on the 27th and the
// leaking kept going after it.
//
// They could not have come from the app: features/orders/write.service.ts:62
// calls legacyPurchase.createOrder unconditionally, so a real order lands in
// exchange.purchase_orders too. No exchange row means no app.
//
// WHY IT MATTERED: verify:backfill rebuilds from `exchange` and compares
// against dev, so rows exchange cannot produce read as a permanent failure -
// 63 orders in dev against 36 from a rebuild. After this, orders.orders and
// orders.items compare clean and the run is down from 52 differences to 46.
//
// Dry by default; --commit to apply. Deletes by NAMED IDS only, never a
// predicate, so it cannot widen. Refuses if any orphan is not a Pending
// purchase, and refuses if any survive the delete. Safe to re-run: it now
// finds nothing.
import "#env";
import pool from "#db";
import fs from "node:fs";

const COMMIT = process.argv.includes("--commit");
const dumpAt = process.argv.indexOf("--dump");
const DUMP = dumpAt === -1 ? null : process.argv[dumpAt + 1];

const ORPHAN = `NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id=o.id)
            AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    s WHERE s.id=o.id)`;

const c = await pool.connect();
await c.query("BEGIN");
try {
  const { rows: found } = await c.query(
    `SELECT o.id, o.direction::text AS direction, o.status, o.number, o.created_at
       FROM orders.orders o WHERE ${ORPHAN} ORDER BY o.created_at`
  );
  const ids = found.map((r) => r.id);
  console.log(`orphans found: ${ids.length}`);

  // Refuse anything that is not the shape we diagnosed.
  const odd = found.filter((r) => r.direction !== "purchase" || r.status !== "Pending");
  if (odd.length) {
    console.table(odd);
    throw new Error(`REFUSING: ${odd.length} orphan(s) are not Pending purchases. Not what was approved.`);
  }
  if (ids.length === 0) throw new Error("nothing to do");

  // Free insurance: the full rows, before anything is written.
  if (DUMP) {
    const tables = {
      "orders.orders": `SELECT * FROM orders.orders WHERE id = ANY($1::uuid[])`,
      "orders.items": `SELECT * FROM orders.items WHERE order_id = ANY($1::uuid[])`,
      "orders.transactions": `SELECT * FROM orders.transactions WHERE order_id = ANY($1::uuid[])`,
      "refiners.orders": `SELECT * FROM refiners.orders WHERE order_id = ANY($1::uuid[])`,
      "refiners.items": `SELECT * FROM refiners.items WHERE refiner_order_id IN (SELECT id FROM refiners.orders WHERE order_id = ANY($1::uuid[]))`,
    };
    const out = {};
    for (const [t, sql] of Object.entries(tables)) out[t] = (await c.query(sql, [ids])).rows;
    fs.writeFileSync(DUMP, JSON.stringify(out, null, 2));
    console.log(`dumped ${Object.entries(out).map(([t, r]) => `${t}=${r.length}`).join(" ")} -> ${DUMP}`);
  }

  const steps = [
    ["refiners.items",   `DELETE FROM refiners.items  WHERE refiner_order_id IN (SELECT id FROM refiners.orders WHERE order_id = ANY($1::uuid[]))`],
    ["refiners.spots",   `DELETE FROM refiners.spots  WHERE refiner_order_id IN (SELECT id FROM refiners.orders WHERE order_id = ANY($1::uuid[]))`],
    ["refiners.orders",  `DELETE FROM refiners.orders WHERE order_id = ANY($1::uuid[])`],
    ["orders.items",     `DELETE FROM orders.items    WHERE order_id = ANY($1::uuid[])`],
    ["orders.spots",     `DELETE FROM orders.spots    WHERE order_id = ANY($1::uuid[])`],
    ["orders.transactions", `DELETE FROM orders.transactions WHERE order_id = ANY($1::uuid[])`],
    ["fulfillments.fulfillments", `DELETE FROM fulfillments.fulfillments WHERE order_id = ANY($1::uuid[])`],
    ["orders.orders",    `DELETE FROM orders.orders   WHERE id = ANY($1::uuid[])`],
  ];
  for (const [name, sql] of steps) {
    const r = await c.query(sql, [ids]);
    console.log(`  ${name.padEnd(28)} ${r.rowCount}`);
  }

  const { rows: [left] } = await c.query(
    `SELECT count(*)::int n FROM orders.orders o WHERE ${ORPHAN}`
  );
  if (left.n !== 0) throw new Error(`REFUSING: ${left.n} orphans remain after the delete`);

  // exchange must be untouched: it was never referenced above, assert it anyway.
  const { rows: [ex] } = await c.query(
    `SELECT (SELECT count(*)::int FROM exchange.purchase_orders) po,
            (SELECT count(*)::int FROM exchange.sales_orders) so`
  );
  console.log(`exchange after: purchase_orders=${ex.po} sales_orders=${ex.so}`);

  if (COMMIT) { await c.query("COMMIT"); console.log("COMMITTED"); }
  else { await c.query("ROLLBACK"); console.log("ROLLED BACK (dry run; pass --commit)"); }
} catch (e) {
  await c.query("ROLLBACK");
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
