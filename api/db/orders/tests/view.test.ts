import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import {
  aUser, anAddress, anOrder, aProduct, aShipment, aPayout,
} from "#shared/testing/builders/index.ts";
import * as orders from "#db/orders/repo.ts";
import { OrderViewFacts } from "@dorado/contracts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});
afterAll(async () => { await pool.end(); });

const inRollback = rollbackIn({ lock: [LOCKS.ORDERS, LOCKS.ADDRESSES] });

test("the order view is one read that parses through OrderViewFacts", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const address = await anAddress(c, user);
    const product = await aProduct(c);
    const order = await anOrder(c, user, { direction: "purchase" })
      .withLots(1)
      .withBullion(product, 3, { price: 250 })
      .withAddress(address)
      .withTotals({ total: 1234.5 });
    await aShipment(c, order);
    await aPayout(c, user, { order });

    const raw = await orders.view(order.id, c);
    assert.ok(raw, "the view read nothing back");
    const parsed = OrderViewFacts.parse(raw);

    assert.equal(parsed.order.id, order.id);
    assert.equal(parsed.user?.id, user.id);
    assert.equal(parsed.address?.id ? true : false, true, "the address did not nest");
    assert.equal(parsed.totals?.total, 1234.5);
    assert.equal(parsed.items.length, 2, "the lines did not nest by table");
    assert.equal(parsed.shipments.length, 1, "the shipment did not nest by table");
    assert.ok(parsed.payout, "the payout did not nest");
  });
});

test("a bullion line carries its payable and its line total from SQL, and no product", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const product = await aProduct(c);
    const order = await anOrder(c, user, { direction: "purchase" })
      .withBullion(product, 4, { price: 25 });

    const view = await orders.view(order.id, c);
    assert.ok(view);
    const line = view.items.find((i) => i.bullion_id === product.id);
    assert.ok(line, "the bullion line is missing");
    assert.ok(!("product" in line), "the view still embeds the catalogue row");
    assert.equal(line.line_total, 100, "line_total is not price x quantity");
    assert.equal(
      line.payable,
      line.content === null || line.premium === null ? null : line.content * line.premium,
      "payable is not content x premium"
    );
  });
});

test("an order with no children answers empty arrays and nulls, not undefined", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });

    const view = await orders.view(order.id, c);
    assert.ok(view);
    assert.deepEqual(view.items, []);
    assert.deepEqual(view.shipments, []);
    assert.equal(view.address, null);
    assert.equal(view.totals, null);
    assert.equal(view.pickup, null);
    assert.equal(view.payout, null);
  });
});

test("an id nobody owns reads back nothing rather than an empty view", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(
      await orders.view("00000000-0000-4000-8000-000000000000", c), undefined
    );
  });
});
