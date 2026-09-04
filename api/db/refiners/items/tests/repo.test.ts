import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder, aRefinerEngagement } from "#shared/testing/builders/index.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

const inRollback = rollbackIn({ lock: LOCKS.ORDERS });

const aMirroredLine = async (c: PoolClient) => {
  const order = await anOrder(c, await aUser(c), { direction: "purchase" }).withLots(1);
  await aRefinerEngagement(c, order);
  return { order_item_id: order.items[0]!.id };
};

test("update writes the assay quad and the premium on a real line", async () => {
  await inRollback(async (c: PoolClient) => {
    const line = await aMirroredLine(c);

    const changed = await refinerItems.update(
      line.order_item_id,
      { premium: 12.5, pre_melt: 10, post_melt: 9, purity: 0.9, content: 8.1 },
      c
    );
    assert.equal(changed, true, "update reported no row changed");

    const { rows: [after] } = await c.query(
      `SELECT premium, pre_melt, post_melt, purity, content
         FROM refiners.items WHERE order_item_id = $1`,
      [line.order_item_id]
    );
    assert.equal(Number(after.premium), 12.5);
    assert.equal(Number(after.pre_melt), 10);
    assert.equal(Number(after.post_melt), 9);
    assert.equal(Number(after.purity), 0.9);
    assert.equal(Number(after.content), 8.1);
  });
});

test("a column absent from the patch is left alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const line = await aMirroredLine(c);
    await c.query(
      `UPDATE refiners.items SET premium = 3, purity = 0.5 WHERE order_item_id = $1`,
      [line.order_item_id]
    );

    await refinerItems.update(line.order_item_id, { premium: 7 }, c);

    const { rows: [after] } = await c.query(
      `SELECT premium, purity FROM refiners.items WHERE order_item_id = $1`,
      [line.order_item_id]
    );
    assert.equal(Number(after.premium), 7);
    assert.equal(Number(after.purity), 0.5, "an absent field was overwritten");
  });
});

test("update answers false for an order_item_id with no refiners.items row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await refinerItems.update(randomUUID(), { premium: 1 }, c);
    assert.equal(changed, false, "update reported a change for a line that does not exist");
  });
});
