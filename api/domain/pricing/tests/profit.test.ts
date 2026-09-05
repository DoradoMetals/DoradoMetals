import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import {
  aUser, anOrder, aProduct, aShipment, aRefinerEngagement,
} from "#shared/testing/builders/index.ts";
import { profitBreakdown } from "#domain/pricing/profit.ts";

afterAll(async () => {
  await pool.end();
});

test("profitBreakdown prices a bullion line, its inbound shipping and a refiner engagement together", async () => {
  await inPinnedTransaction(async (c) => {
    const seller = await aUser(c);
    const product = await aProduct(c);
    const order = await anOrder(c, seller, { direction: "purchase" })
      .withBullion(product, 1).withSpots().withTotals({});
    await aShipment(c, order, { cost: 24.5 });
    await aRefinerEngagement(c, order);

    const breakdown = await profitBreakdown({ order_id: order.id });

    assert.equal(breakdown.order_id, order.id);
    assert.equal(
      breakdown.customer.shipping_net, -24.5,
      "the inbound shipment's own cost should show up as the customer's net"
    );
    for (const party of ["refiner", "dorado", "customer"] as const) {
      for (const field of ["shipping_net", "refiner_fee_net", "spot_net", "total_profit"] as const) {
        assert.ok(Number.isFinite(breakdown[party][field]), `${party}.${field} is not finite`);
      }
    }
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
