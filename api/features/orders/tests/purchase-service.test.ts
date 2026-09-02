// Service-level atomicity for the two operations that delete or reprice.
//
// The executor problem has a mirror image at this layer: a service that makes
// several repo calls without a transaction commits each one separately, so a
// failure partway leaves half the work done.
//
// SINCE D212 the scrap IS the line: orders.items carries the declared weights
// and refiners.items the assay actuals, so "delete the scrap with its line"
// became one guarded statement plus a cascade. What still needs the
// transaction is the RE-TIER that follows a delete - survivors repriced from
// the changed per-metal totals - and the weights+premium pair on an edit.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { LOCKS } from "#shared/testing/locks.ts";
import * as service from "#features/orders/service.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();

  // THE ORDERS LOCK, HELD FOR THE WHOLE FILE - and a SESSION lock, not the
  // transaction-scoped one every other file uses. takeLocks() cannot be used
  // here: it takes pg_advisory_xact_lock, and THIS FILE HAS NO TRANSACTIONS.
  // Every statement autocommits, so a transaction-scoped lock would be
  // released before the next statement ran. A session lock contends in the
  // same lock space, so it serialises correctly against every file that takes
  // ORDERS the ordinary way.
  await client.query("SELECT pg_advisory_lock($1)", [LOCKS.ORDERS]);
});

after(async () => {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCKS.ORDERS]);
  client.release();
  await pool.end();
});

// Builds a NATIVE purchase order with one scrap line and its refiner
// counterpart, on the given connection. A scrap line is a line whose
// bullion_id is null (the one-table model).
const anOrderWithScrap = async (c: PoolClient) => {
  const { rows: [metal] } = await c.query("SELECT id FROM metals.metals LIMIT 1");
  const { rows: [order] } = await c.query(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('purchase', 'Pending', nextval('orders.purchase_number_seq'))
     RETURNING id`
  );
  const { rows: [item] } = await c.query(
    `INSERT INTO orders.items (id, order_id, metal_id, pre_melt, purity, content, premium, quantity, confirmed, unit)
     VALUES (gen_random_uuid(), $1, $2, 10, 0.9, 9, 0.75, 1, false, 't oz') RETURNING id`,
    [order.id, metal.id]
  );
  // The engagement and the refiner counterpart, as creation writes them.
  const { rows: [engagement] } = await c.query(
    `INSERT INTO refiners.orders (order_id) VALUES ($1) RETURNING id`, [order.id]
  );
  await c.query(
    `INSERT INTO refiners.items (order_item_id, refiner_order_id, metal_id, quantity)
     VALUES ($1, $2, $3, 1)`,
    [item.id, engagement.id, metal.id]
  );
  return { orderId: order.id, itemId: item.id };
};

// The services open their own transactions, so these tests cannot run inside
// one - a rolled-back outer transaction would not see the service's commit.
// They clean up after themselves instead, scoped strictly to the fixture's
// ids.
const cleanup = async (c: PoolClient, { orderId }: { orderId: string }) => {
  await c.query(
    "DELETE FROM refiners.items WHERE order_item_id IN (SELECT id FROM orders.items WHERE order_id = $1)",
    [orderId]
  );
  await c.query("DELETE FROM refiners.spots WHERE order_id = $1", [orderId]);
  await c.query("DELETE FROM refiners.orders WHERE order_id = $1", [orderId]);
  for (const t of ["orders.items", "orders.spots", "orders.transactions", "orders.addresses"]) {
    await c.query(`DELETE FROM ${t} WHERE order_id = $1`, [orderId]);
  }
  await c.query("DELETE FROM orders.orders WHERE id = $1", [orderId]);
};

test("deleting a line removes it and its refiner counterpart together", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await service.deleteOrderItems({
      items: [{ id: fixture.itemId, purchase_order_id: fixture.orderId }],
    });

    const item = await client.query("SELECT 1 FROM orders.items WHERE id = $1", [fixture.itemId]);
    const refiner = await client.query(
      "SELECT 1 FROM refiners.items WHERE order_item_id = $1", [fixture.itemId]
    );
    assert.equal(item.rows.length, 0, "the order line survived");
    assert.equal(refiner.rows.length, 0, "the refiner counterpart survived the cascade");
  } finally {
    await cleanup(client, fixture);
  }
});

// The property the transaction buys: if anything in the delete-and-retier
// throws, every line must survive - a half-applied delete would leave the
// per-metal totals and the surviving premiums disagreeing.
test("a failure mid-delete leaves every line intact", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    // An id that is not a uuid makes the statement throw after the valid id
    // is already part of the same statement's parameter set - the whole
    // transaction rolls back.
    await assert.rejects(() =>
      service.deleteOrderItems({
        items: [
          { id: fixture.itemId, purchase_order_id: fixture.orderId },
          { id: "not-a-uuid", purchase_order_id: fixture.orderId },
        ],
      })
    );

    const item = await client.query("SELECT 1 FROM orders.items WHERE id = $1", [fixture.itemId]);
    assert.equal(item.rows.length, 1, "a failed delete still removed the line");
  } finally {
    await cleanup(client, fixture);
  }
});

// The delete is GUARDED by the order id now - a line list that names no order
// is refused rather than deleted on ids alone (the unguarded delete is the
// exchange behaviour this replaced).
test("a delete naming no order is refused", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await assert.rejects(
      () => service.deleteOrderItems({ items: [{ id: fixture.itemId }] }),
      /refusing an unguarded delete/
    );
    const item = await client.query("SELECT 1 FROM orders.items WHERE id = $1", [fixture.itemId]);
    assert.equal(item.rows.length, 1, "the refused delete still removed the line");
  } finally {
    await cleanup(client, fixture);
  }
});

// updateScrapItem writes the declared weights, the assay actuals and the
// premium in one transaction; all three feed content * spot * premium, and
// applying one without the others quotes a price from a mix of old figures
// and new.
test("editing a scrap line applies the weights, the actuals and the premium together", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await service.updateScrapItem({
      item: {
        id: fixture.itemId,
        premium: 0.82,
        scrap: {
          pre_melt: 10, post_melt: 8, purity: 0.5,
          gross_unit: "t oz", bid_premium: 0.82,
        },
      },
    });

    const { rows: [item] } = await client.query(
      "SELECT content, premium FROM orders.items WHERE id = $1", [fixture.itemId]
    );
    assert.equal(Number(item.content), 4, "8 post-melt at 0.5 purity");
    assert.equal(Number(item.premium), 0.82);

    // No actuals were sent, so the declared values stand in for them - the
    // fallback the old *_actual columns spelled out - and they land on the
    // refiner line. The content quirk is PRESERVED, verbatim from exchange:
    // the stored post_melt falls back to the declared post_melt (8), but the
    // derived content falls back to PRE_melt (10 * 0.5 = 5), because the old
    // statement computed `post_melt_actual ?? pre_melt` while storing
    // `post_melt_actual ?? post_melt`. Behaviour is pinned, not endorsed.
    const { rows: [refiner] } = await client.query(
      "SELECT post_melt, purity, content FROM refiners.items WHERE order_item_id = $1",
      [fixture.itemId]
    );
    assert.equal(Number(refiner.post_melt), 8);
    assert.equal(Number(refiner.purity), 0.5);
    assert.equal(Number(refiner.content), 5);
  } finally {
    await cleanup(client, fixture);
  }
});
