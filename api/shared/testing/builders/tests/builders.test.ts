import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR, actingAs } from "#shared/testing/actor.ts";
import { assertNothingEscaped } from "#shared/testing/pinned-pool.ts";
import {
  aUser, anAdmin, anAddress, aProduct, anOrder, aCart, aShipment,
  aPayout, aPaymentIntent, aRefinerEngagement, aLead, aReview, anUnknownId,
} from "#shared/testing/builders/index.ts";

afterAll(async () => { await pool.end(); });

const ALL_LOCKS = [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.FULFILLMENTS, LOCKS.USERS];

test("a built user is a real person in auth.users, and nothing mirrors it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c, { funds: 250 });
    const { rows: auth } = await c.query(
      `SELECT email, name, role, dorado_funds FROM auth.users WHERE id = $1`, [user.id]
    );
    assert.equal(auth.length, 1, "the builder wrote no auth.users row");
    assert.equal(auth[0].email, user.email);
    assert.equal(Number(auth[0].dorado_funds), 250, "the starting balance was not set");

    // Migration 133 retired the auth -> exchange identity mirror (ruling 36,
    // Jacob 2026-09-06). A new user is an auth.users row and nothing else; the
    // exchange rows that already exist keep their values and stop changing.
    const { rows: mirrored } = await c.query(
      `SELECT email, name FROM exchange.users WHERE id = $1`, [user.id]
    );
    assert.equal(mirrored.length, 0, "the retired identity mirror still fired");

    const admin = await anAdmin(c);
    assert.equal(admin.role, "admin");
  }, { lock: LOCKS.USERS });
});

test("a built address is owned, and its owner can find it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const address = await anAddress(c, user, { state: "CA", city: "Fresno" });

    const { rows } = await c.query(
      `SELECT a.city, a.state, ua.label, ua.default_shipping
         FROM places.addresses a
         JOIN places.user_addresses ua ON ua.address_id = a.id
        WHERE a.id = $1 AND ua.user_id = $2`, [address.id, user.id]
    );
    assert.equal(rows.length, 1, "the address is in nobody's book");
    assert.equal(rows[0].state, "CA");
    assert.equal(rows[0].city, "Fresno");
    assert.equal(rows[0].default_shipping, true);
  }, { lock: LOCKS.ADDRESSES });
});

test("a built product carries the purity and premiums it was asked for", async () => {
  await inRollback(async (c: PoolClient) => {
    const product = await aProduct(c, { purity: 0.9995, bid_premium: 12.5, content: 0.5 });
    const { rows } = await c.query(
      `SELECT purity, bid_premium, content, name
         FROM products.bullion WHERE id = $1`, [product.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].purity), 0.9995);
    assert.equal(Number(rows[0].bid_premium), 12.5);
    assert.equal(Number(rows[0].content), 0.5);
  });
});

test("an order builds with its lines, its money row and its address snapshot", async () => {
  await inRollback(async (c: PoolClient) => {
    const seller = await aUser(c);
    const address = await anAddress(c, seller);
    const product = await aProduct(c);
    const order = await anOrder(c, seller, { direction: "purchase" })
      .withLots(2, { metal_id: "Silver", pre_melt: 20 })
      .withBullion(product, 3)
      .withTotals({ total: 1234.56, shipping: 24.5 })
      .withAddress(address);

    assert.ok(order.number > 0, "the order got no number from its sequence");
    assert.equal(order.items.length, 3);

    const { rows: lines } = await c.query(
      `SELECT bullion_id, quantity, pre_melt FROM orders.items WHERE order_id = $1
        ORDER BY bullion_id NULLS FIRST`, [order.id]
    );
    assert.equal(lines.length, 3);
    assert.equal(lines.filter((l) => l.bullion_id === null).length, 2, "the lots are missing");
    assert.equal(Number(lines[2].quantity), 3, "the bullion line kept the wrong quantity");

    const { rows: totals } = await c.query(
      `SELECT total, shipping FROM orders.transactions WHERE order_id = $1`, [order.id]
    );
    assert.equal(Number(totals[0].total), 1234.56);

    const { rows: snap } = await c.query(
      `SELECT address_id, source_address_id FROM orders.addresses WHERE order_id = $1`,
      [order.id]
    );
    assert.equal(snap.length, 1);
    assert.notEqual(snap[0].address_id, address.id, "the snapshot is the live row");
    assert.equal(snap[0].source_address_id, address.id);
  }, { lock: ALL_LOCKS });
});

test("a cart holds its basket, and building a second one replaces it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const product = await aProduct(c);
    const first = await aCart(c, user, { direction: "purchase" }).withLots(3);
    assert.equal(first.item_ids.length, 3);

    const again = await aCart(c, user, { direction: "purchase" }).withBullion(product, 2);
    assert.equal(again.id, first.id, "a second session was minted for one direction");
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM checkout.items WHERE checkout_id = $1`, [again.id]
    );
    assert.equal(rows[0].n, 1, "the basket was merged rather than replaced");
  }, { lock: LOCKS.ORDERS });
});

test("a shipment reaches its order through the fulfillment link", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" }).withLots(1);
    const shipment = await aShipment(c, order, { cost: 31.25 });

    const { rows } = await c.query(
      `SELECT s.tracking_number, s.cost, f.order_id
         FROM shipping.shipments s
         JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE s.id = $1`, [shipment.id]
    );
    assert.equal(rows.length, 1, "the parcel belongs to no order");
    assert.equal(rows[0].order_id, order.id);
    assert.equal(Number(rows[0].cost), 31.25);
  }, { lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

test("a payout is SEALED, links to the order, and leaves the plaintext columns NULL", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user).withTotals({ total: 100 });
    const payout = await aPayout(c, user, { order });

    const { rows } = await c.query(
      `SELECT routing_number, account_number, last_four,
              routing_number_encrypted, account_number_encrypted
         FROM payments.details WHERE id = $1`, [payout.id]
    );
    assert.equal(rows[0].routing_number, null, "a fixture wrote a plaintext routing number");
    assert.equal(rows[0].account_number, null, "a fixture wrote a plaintext account number");
    assert.equal(rows[0].last_four, "6789");
    assert.ok(rows[0].routing_number_encrypted?.startsWith("v1."), "not an envelope");
    assert.ok(
      !rows[0].account_number_encrypted.includes(payout.account_number),
      "the envelope leaks the plaintext"
    );

    const { rows: link } = await c.query(
      `SELECT payout_details_id FROM orders.transactions WHERE order_id = $1`, [order.id]
    );
    assert.equal(link[0].payout_details_id, payout.id, "the account was not linked");
  }, { lock: LOCKS.ORDERS });
});

test("an intent, an engagement, a lead and a review all land", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user).withLots(2, { metal_id: "Gold" });

    const intent = await aPaymentIntent(c, user, { order, amount_expected: 4200 });
    assert.equal(intent.order_id, order.id);
    assert.equal(Number(intent.amount_expected), 4200);

    const engagement = await aRefinerEngagement(c, order);
    assert.equal(engagement.item_ids.length, 2, "the mirror does not match the lines");
    const { rows: spots } = await c.query(
      `SELECT count(*)::int n FROM refiners.spots WHERE refiner_order_id = $1`,
      [engagement.id]
    );
    assert.equal(spots[0].n, 1, "one metal, one locked spot");

    const lead = await aLead(c, { priority: "High" });
    assert.equal(lead.priority, "High");

    const review = await aReview(c, order, { rating: 4 });
    assert.equal(Number(review.rating), 4);
    assert.equal(review.hidden, true, "a fixture review is public");
  }, { lock: LOCKS.ORDERS });
});

test("every audited row a builder writes is stamped with the actor", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user).withLots(1).withTotals({ total: 10 });
    const lead = await aLead(c);

    for (const [table, id] of [
      ["orders.orders", order.id],
      ["leads.leads", lead.id],
    ] as const) {
      const { rows } = await c.query(
        `SELECT created_by_id, updated_by_id, created_by FROM ${table} WHERE id = $1`, [id]
      );
      assert.equal(
        rows[0].created_by_id, TEST_ACTOR.id,
        `${table} was written by nobody - the default actor did not reach the trigger`
      );
      assert.equal(rows[0].updated_by_id, TEST_ACTOR.id);
      assert.equal(rows[0].created_by, TEST_ACTOR.name, `${table}'s legacy name column is empty`);
    }
  }, { lock: LOCKS.ORDERS });
});

test("actingAs re-attributes the writes that follow it", async () => {
  await inRollback(async (c: PoolClient) => {
    const alice = await aUser(c, { name: "Alice Builder" });
    await actingAs(c, alice.id);
    const order = await anOrder(c, alice).withLots(1);

    const { rows } = await c.query(
      `SELECT created_by_id, created_by FROM orders.orders WHERE id = $1`, [order.id]
    );
    assert.equal(rows[0].created_by_id, alice.id, "the switched actor did not stamp");
    assert.equal(rows[0].created_by, "Alice Builder");
  }, { lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

test("an unknown actor leaves the row unattributed rather than refusing it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await actingAs(c, anUnknownId());
    const order = await anOrder(c, user).withLots(1);
    const { rows } = await c.query(
      `SELECT created_by_id FROM orders.orders WHERE id = $1`, [order.id]
    );
    assert.equal(
      rows[0].created_by_id, null,
      "an unknown actor was stamped anyway - the FK would refuse a real order"
    );
  }, { lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

test("nothing a builder writes survives the rollback", async () => {
  let userId = "";
  let orderId = "";
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user).withLots(1);
    userId = user.id;
    orderId = order.id;
  }, { lock: [LOCKS.ORDERS, LOCKS.USERS] });

  assert.equal(await assertNothingEscaped("auth.users", "id = $1", [userId]), 0);
  assert.equal(await assertNothingEscaped("exchange.users", "id = $1", [userId]), 0);
  assert.equal(await assertNothingEscaped("orders.orders", "id = $1", [orderId]), 0);
});
