import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { aUser, aCart, anAddress, fulfillmentMethodId } from "#shared/testing/builders/index.ts";
import * as service from "#domain/fulfillments/drafts.ts";

afterAll(async () => {
  await pool.end();
});

test("a handoff code with no method_id resolves to the matching method type", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);
    const cart = await aCart(c, customer, { direction: "purchase" });

    const view = await service.createForCheckout(
      { checkout_id: cart.id, handoff_code: "DROPOFF_AT_FEDEX_LOCATION" },
      customer.id,
      false
    );

    assert.equal(view.method.type, "CARRIER DROPOFF");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

test("an unknown handoff code is refused before any method is chosen", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);
    const cart = await aCart(c, customer, { direction: "purchase" });

    await assert.rejects(
      () => service.createForCheckout(
        { checkout_id: cart.id, handoff_code: "NOT_A_REAL_HANDOFF" },
        customer.id,
        false
      ),
      /no such handoff/
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

test("withDefaultAddress falls back to any valid address when none is both default and valid", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);
    const cart = await aCart(c, customer, { direction: "purchase" });
    const invalidDefault = await anAddress(c, customer);
    await c.query(`UPDATE places.addresses SET is_valid = false WHERE id = $1`, [invalidDefault.id]);
    const validNonDefault = await anAddress(c, customer, { default_shipping: false });

    const method_id = await fulfillmentMethodId(c, "CARRIER DROPOFF", "purchase");
    const view = await service.createForCheckout(
      { checkout_id: cart.id, method_id },
      customer.id,
      false
    );

    assert.equal(
      view.parcel?.shipper_address_id,
      validNonDefault.id,
      "the fallback should have picked the only valid address left in the book"
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.FULFILLMENTS] });
});
