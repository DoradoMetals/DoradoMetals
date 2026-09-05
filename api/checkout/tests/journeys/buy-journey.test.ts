import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { withCassette } from "#shared/testing/cassettes.ts";
import * as place from "#orders/place.ts";
import {
  aHandover, aUser, anAdmin, anAddress, aProduct, saleServiceId, paymentMethodId,
} from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

const stubWorld = (): typeof place.LIVE => ({
  buyLabel: async () => {},
  authorize: async () => {},
  confirm: async () => {},
});

const asCaller = (u: { id: string; name: string | null; email: string | null }) =>
  ({ id: u.id, name: u.name, email: u.email, role: "user" });

test("basket, row, a real intent and placement agree on one sales order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const built = await aUser(c);
    const customer = asCaller(built);
    const admin = await anAdmin(c);
    const address = await anAddress(c, customer);
    const product = await aProduct(c, { metal_id: "Gold", content: 1, ask_premium: 60 });
    const service = await saleServiceId(c);
    const method = await paymentMethodId(c, "CARD", "sale");

    await query(
      `UPDATE auth.users SET "stripeCustomerId" = $1 WHERE id = $2`,
      ["cus_cassette_buy_journey", built.id], c
    );

    const basket = await as(customer, () =>
      request(app).put("/api/checkout/items").query({ direction: "sale" }).send({
        items: [{ bullion_id: product.id, quantity: 1 }],
      })
    );
    assert.equal(basket.status, 200, basket.text);
    assert.equal(basket.body.length, 1);

    const patched = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "sale",
        recipient_address_id: address.id,
        payment_method_id: method,
      })
    );
    assert.equal(patched.status, 200, patched.text);
    const checkout_id: string = patched.body.id;
    await aHandover(c, checkout_id, {
      direction: "sale",
      method: "DROPSHIP",
      choices: { shipment: { carrier_service_id: service } },
    });

    const intent = await withCassette("stripe/create-payment-intent.json", () =>
      as(customer, () =>
        request(app).post("/api/stripe/update_payment_intent").send({ type: "customer" })
      )
    );
    assert.equal(intent.status, 200, intent.text);
    assert.ok(
      typeof intent.body === "string" && intent.body.startsWith("pi_"),
      `no client_secret came back: ${JSON.stringify(intent.body)}`
    );

    const placed = await place.place(checkout_id, stubWorld());
    assert.equal(placed.order.direction, "sale");
    assert.equal(placed.items.length, 1);
    assert.equal(placed.items[0]!.bullion_id, product.id);

    const { rows: [attached] } = await c.query(
      `SELECT order_id FROM payments.intents WHERE user_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [built.id]
    );
    assert.equal(
      attached.order_id, placed.order.id,
      "placement did not attach the intent this HTTP call opened"
    );

    for (const status of ["Preparing", "Shipped", "Cancelled"]) {
      const moved = await asAdmin(admin, () =>
        request(app).patch(`/api/orders/${placed.order.id}`).send({ status })
      );
      assert.equal(moved.status, 200, moved.text);
      assert.equal(moved.body.order.status, status);
    }
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] });
});
