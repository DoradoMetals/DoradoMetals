import "#env";
import pool from "#pool";

const COMMIT = process.argv.includes("--commit");

const IDS = [
  "bb29c1df-3477-4d1b-8a20-c73c4adb847a",
  "8f72e452-6048-4d2f-9e95-9f1e570fc88d",
  "1daf662e-9848-4a6e-ba9e-62cbc77c03ac",
  "a2dec20c-a830-472c-98a2-2231fb541eda",
  "76d1ea6b-150e-4ce7-a245-88198298963d",
  "c5b3b723-fceb-4ba5-bba1-9dac8f42f5c7",
];

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
