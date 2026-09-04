// Removes the test rows left behind in DEV on 2026-08-27. TWO SETS, from two
// different mistakes, both mine and both fully backed up first.
//
// NOT RUN. It deletes rows, and this project's rule is that a delete needs
// explicit confirmation. Read this file, then:
//
//     pnpm --filter @dorado/api clean:dual-orphans          # what it would do
//     pnpm --filter @dorado/api clean:dual-orphans --commit # actually do it
//
// ---------------------------------------------------------- what happened (1)
//
// SIX ORDERS AND FOUR ITEMS IN orders.*, from running the suite under `dual`.
//
// features/orders/tests/purchase-service.test.ts builds its fixture by INSERTing a
// purchase order straight into `exchange`, calls a service - which opens its own
// transaction and commits - and then deletes the exchange rows again. That is
// correct while the switch is on `exchange`, because the service writes nowhere
// else.
//
// With PURCHASE_ORDERS_SOURCE=dual the same service ALSO mirrors the order into
// orders.orders and orders.items, and the cleanup knows nothing about those. So
// each run of that file leaves three orders behind. Two runs, six orders.
//
// This is the audit:test-leaks hazard in a form that audit does not cover: it
// fingerprints `exchange`, and nothing here touched `exchange` in the end.
//
// ---------------------------------------------------------- what happened (2)
//
// FIVE PURCHASE ORDERS IN exchange.purchase_orders AND orders.orders, from a
// shipments test fixture.
//
// features/shipping/shipments/tests/service.test.js used to search dev for a
// shipment-less order and return early when it found none - which was ALWAYS,
// so all seven of its tests passed while asserting nothing. Building the order
// instead fixed that, and the last test in the file needs a SECOND connection
// to prove a write is invisible from outside. The fixture was built on that
// second connection, which has no transaction open, so the INSERT committed.
// Five runs, five orders.
//
// The test now builds the order inside the rolled-back transaction and asserts
// the fixture itself did not escape.
//
// ---------------------------------------------------------------- why it matters
//
// It is not lost data - it is added data - but it is the state that makes the
// order backfill refuse, because the target now holds rows the source does not
// and a backfill would overwrite them. It also fails three tests in
// features/orders/tests/purchase-read.test.ts, which compare the new schema's
// rows against exchange's and are right to.
//
// ---------------------------------------------------------------- safety
//
// The full contents of every row were dumped before anything was written, to
//
//     ~/dev-orphan-orders-restore-2026-08-27.sql   (set 1)
//     ~/dev-leaked-orders-restore-2026-08-27.sql   (set 2)
//
// which are plain INSERT statements and put them back exactly. This script
// deletes ELEVEN NAMED IDS and nothing else - never a predicate, so it cannot
// widen - refuses if anything at all references them, and refuses if the row
// counts are not exactly what was backed up.
import "#env";
import pool from "#pool";

const COMMIT = process.argv.includes("--commit");

// The six, by id. Created 06:47:46, 06:47:52, 06:47:56 (first run) and
// 06:52:42, 06:52:49, 06:52:53 (second run), all Pending purchases, all the
// same user - three per run, one per fixture-building test.
const IDS = [
  "bb29c1df-3477-4d1b-8a20-c73c4adb847a",
  "8f72e452-6048-4d2f-9e95-9f1e570fc88d",
  "1daf662e-9848-4a6e-ba9e-62cbc77c03ac",
  "a2dec20c-a830-472c-98a2-2231fb541eda",
  "76d1ea6b-150e-4ce7-a245-88198298963d",
  "c5b3b723-fceb-4ba5-bba1-9dac8f42f5c7",
];

// The five, by id. Created 07:57:12 through 08:00:53 the same morning, all
// Pending purchases, all by the same fixture - one per run of the last test in
// features/shipping/shipments/tests/service.test.js. Each has a matching
// orders.orders row the same fixture created.
const LEAKED = [
  "e2f1514a-bd46-4d2f-9a70-7912bd19e8fc",
  "8e5a31ef-513e-42dc-a872-32e6edf45632",
  "a2afdc58-0de5-4ce5-b868-17c4ec8f264d",
  "24392232-9d35-43cb-aab4-a4cdc4186feb",
  "96fa9f42-6492-4b30-96fe-a47b5d98a765",
];

const c = await pool.connect();
await c.query("BEGIN");

try {
  const { rows: [guard] } = await c.query(
    `SELECT
       (SELECT count(*)::int FROM exchange.purchase_orders WHERE id = ANY($1::uuid[])) ex_purchase_orders,
       (SELECT count(*)::int FROM exchange.sales_orders    WHERE id = ANY($1::uuid[])) ex_sales_orders,
       (SELECT count(*)::int FROM orders.spots       WHERE order_id = ANY($1::uuid[])) spots,
       (SELECT count(*)::int FROM orders.addresses   WHERE order_id = ANY($1::uuid[])) addresses,
       (SELECT count(*)::int FROM payments.ledger    WHERE order_id = ANY($1::uuid[])) ledger,
       (SELECT count(*)::int FROM payments.intents   WHERE order_id = ANY($1::uuid[])) intents,
       (SELECT count(*)::int FROM reviews.reviews    WHERE order_id = ANY($1::uuid[])) reviews,
       (SELECT count(*)::int FROM refiners.spots     WHERE order_id = ANY($1::uuid[])) refiner_spots,
       (SELECT count(*)::int FROM fulfillments.fulfillments WHERE order_id = ANY($1::uuid[])) fulfillments`,
    [IDS]
  );

  console.log("what still points at these six orders:");
  console.table([guard]);

  const referenced = Object.values(guard).reduce((a, b) => a + b, 0);
  if (referenced !== 0) {
    throw new Error(
      "REFUSING: something references these orders, or one of them now exists in " +
        "exchange. That means they are not what this script was written for."
    );
  }

  const items = await c.query("DELETE FROM orders.items WHERE order_id = ANY($1::uuid[])", [IDS]);
  const orders = await c.query("DELETE FROM orders.orders WHERE id = ANY($1::uuid[])", [IDS]);

  if (orders.rowCount !== 6 || items.rowCount !== 4) {
    throw new Error(
      `REFUSING: expected exactly 6 orders and 4 items, found ${orders.rowCount} ` +
        `and ${items.rowCount}. The backup describes six and four; anything else ` +
        `means dev has moved on and this script is out of date.`
    );
  }

  console.log(`\n${orders.rowCount} order(s) and ${items.rowCount} item(s) would be removed`);

  // ---- set 2: the five leaked purchase orders and their orders.orders rows.
  const { rows: [leakGuard] } = await c.query(
    `SELECT
       (SELECT count(*)::int FROM exchange.purchase_order_items WHERE purchase_order_id = ANY($1::uuid[])) items,
       (SELECT count(*)::int FROM exchange.shipments   WHERE purchase_order_id = ANY($1::uuid[])) shipments,
       (SELECT count(*)::int FROM orders.items         WHERE order_id = ANY($1::uuid[])) order_items,
       (SELECT count(*)::int FROM orders.addresses     WHERE order_id = ANY($1::uuid[])) addresses,
       (SELECT count(*)::int FROM payments.ledger      WHERE order_id = ANY($1::uuid[])) ledger,
       (SELECT count(*)::int FROM fulfillments.fulfillments WHERE order_id = ANY($1::uuid[])) fulfillments`,
    [LEAKED]
  );
  console.log("\nwhat still points at the five leaked orders:");
  console.table([leakGuard]);
  if (Object.values(leakGuard).reduce((a, b) => a + b, 0) !== 0) {
    throw new Error("REFUSING: something references the leaked orders - they are not what this expects");
  }

  const leakedNew = await c.query("DELETE FROM orders.orders WHERE id = ANY($1::uuid[])", [LEAKED]);
  const leakedOld = await c.query(
    "DELETE FROM exchange.purchase_orders WHERE id = ANY($1::uuid[])", [LEAKED]
  );
  if (leakedOld.rowCount !== 5 || leakedNew.rowCount !== 5) {
    throw new Error(
      `REFUSING: expected exactly 5 and 5, found ${leakedOld.rowCount} and ${leakedNew.rowCount}`
    );
  }
  console.log(`${leakedOld.rowCount} leaked purchase order(s) and ${leakedNew.rowCount} orders.orders row(s) would be removed`);

  if (!COMMIT) {
    await c.query("ROLLBACK");
    console.log("\nrolled back - nothing was changed. Pass --commit to do it for real.");
  } else {
    await c.query("COMMIT");
    console.log("\ncommitted. Restore with ~/dev-orphan-orders-restore-2026-08-27.sql if wrong.");
  }
} catch (err) {
  await c.query("ROLLBACK");
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
