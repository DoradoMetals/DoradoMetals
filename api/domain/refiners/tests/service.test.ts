import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as service from "#domain/refiners/service.ts";

afterAll(async () => {
  await pool.end();
});

test("mirrorForOrder is idempotent - a second call adds nothing already covered", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);
    const order = await anOrder(c, customer, { direction: "purchase" }).withLots(2).withSpots();

    await service.mirrorForOrder(order.id, c);
    const engagement_id = await service.engagementIdFor(order.id, c);

    const itemsAfterFirst = await refinerItems.getForOrder(order.id, c);
    const spotsAfterFirst = await refinerSpots.getForEngagement(engagement_id, c);
    assert.equal(itemsAfterFirst.length, 2, "the first mirror should carry both lines across");
    assert.ok(spotsAfterFirst.length > 0, "the first mirror should carry the frozen spots across");

    await service.mirrorForOrder(order.id, c);

    const itemsAfterSecond = await refinerItems.getForOrder(order.id, c);
    const spotsAfterSecond = await refinerSpots.getForEngagement(engagement_id, c);
    assert.equal(
      itemsAfterSecond.length, itemsAfterFirst.length, "a second mirror duplicated lines"
    );
    assert.equal(
      spotsAfterSecond.length, spotsAfterFirst.length, "a second mirror duplicated spots"
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
