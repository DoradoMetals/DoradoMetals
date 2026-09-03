// The cart routes, over real HTTP.
//
// Four more from the undriven list. These are the ones a customer touches most
// and the ones that were, before this branch, readable and writable by a
// complete stranger - see the authorization entry in FOLLOWUPS.md. The guards
// are covered by replay.test.js; this covers whether the routes DO anything.
//
// ONE OF THEM DOES NOT, AND THAT IS DELIBERATE-LOOKING RATHER THAN DELIBERATE.
// GET /get_cart runs the full cart query and then answers `{ success: true }`,
// discarding it. The buy cart a customer saved is never returned. That is
// recorded as D23 in the decision log rather than changed here, because whether
// a cart follows somebody between devices is a product decision and changing it
// alters what a customer sees on login. The test below asserts what the route
// DOES, and says what it would assert instead.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { aProduct } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type ProductFixture = { id: string; product_name: string | null };

// The frontend generates a UUID per local scrap line and the backend stores it
// AS the scrap row's id, so this cannot be an arbitrary string - a plain
// "local-1" is rejected by the column type, which is how I learned it.
const scrapId = randomUUID();

const customer = TEST_CUSTOMER;

// EACH FIXTURE IS BUILT TO DISCRIMINATE THE ONE FLAG THAT STILL GATES
// ANYTHING (lane 1 built a matrix on two flags; ruling 49, 2026-09-03, dropped
// `sell_display` and with it the "hidden for buying, live for selling" and
// "live for buying, hidden for selling" cases - the sell side has no gate at
// all now, so the only discriminating fact left is `display`, which still
// gates the buy side.
const products = async (c: PoolClient) => {
  const live = await aProduct(c, { display: true });
  const hidden = await aProduct(c, { display: false });
  return {
    product: { id: live.id, product_name: live.name },
    hidden: { id: hidden.id, product_name: hidden.name },
    productId: live.id,
    hiddenId: hidden.id,
  };
};

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("sync_cart replaces the customer's buy cart", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { product, productId, hiddenId } = await products(client);
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const res = await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: productId, quantity: 3 }] });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT ci.bullion_id AS product_id, ci.quantity
           FROM checkout.items ci
           JOIN checkout.checkouts c ON c.id = ci.checkout_id
          WHERE c.user_id = $1 AND c.direction = 'sale'`,
        [customer.id]
      );
      assert.equal(rows.length, 1, "the cart does not hold exactly the one line sent");
      assert.equal(rows[0].product_id, product.id, "a different product was stored");
      assert.equal(Number(rows[0].quantity), 3, "the quantity was not stored");
    });
  }, { actor: TEST_ACTOR.id });
});

// REPLACES, not appends - the name says so and it is the behaviour the frontend
// relies on when it pushes its local cart up.
test("sync_cart replaces rather than appends", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { product, productId, hiddenId } = await products(client);
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: productId, quantity: 3 }] });
      await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: productId, quantity: 1 }] });

      const { rows } = await client.query(
        `SELECT ci.quantity
           FROM checkout.items ci
           JOIN checkout.checkouts c ON c.id = ci.checkout_id
          WHERE c.user_id = $1 AND c.direction = 'sale'`,
        [customer.id]
      );
      assert.equal(rows.length, 1, "the second sync added a line instead of replacing");
      assert.equal(Number(rows[0].quantity), 1, "the cart kept the first quantity");
    });
  }, { actor: TEST_ACTOR.id });
});

test("sync_sell_cart stores a scrap line with its own values", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const res = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({
          cart: [
            {
              type: "scrap",
              quantity: 1,
              data: {
                id: scrapId,
                metal: "Gold",
                pre_melt: 2.5,
                post_melt: 2.4,
                purity: 0.75,
                content: 1.8,
                gross_unit: "t oz",
                bid_premium: 0.9,
              },
            },
          ],
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT ci.purity, ci.pre_melt
           FROM checkout.items ci
           JOIN checkout.checkouts c ON c.id = ci.checkout_id
          WHERE c.user_id = $1 AND c.direction = 'purchase' AND ci.bullion_id IS NULL`,
        [customer.id]
      );
      assert.equal(rows.length, 1, "the sell cart does not hold exactly the one scrap line");
      assert.equal(Number(rows[0].purity), 0.75, "the purity was not stored");
      assert.equal(Number(rows[0].pre_melt), 2.5, "the weight was not stored");
    });
  }, { actor: TEST_ACTOR.id });
});

test("get_sell_cart returns what sync_sell_cart stored", async () => {
  await inPinnedTransaction(async () => {
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({
          cart: [
            {
              type: "scrap",
              quantity: 1,
              data: {
                id: scrapId,
                metal: "Gold",
                pre_melt: 2.5,
                purity: 0.75,
                content: 1.8,
                gross_unit: "t oz",
                bid_premium: 0.9,
              },
            },
          ],
        });

      const res = await request(app).get("/api/cart/get_sell_cart");
      assert.equal(res.status, 200, `answered ${res.status}`);
      assert.ok(Array.isArray(res.body), "the sell cart did not come back as a list");
      assert.equal(res.body.length, 1, "the stored scrap line did not come back");
      assert.equal(res.body[0].type, "scrap", "the line lost its type");
    });
  }, { actor: TEST_ACTOR.id });
});

// ASSERTS WHAT THE ROUTE DOES, WHICH IS NOT WHAT IT LOOKS LIKE IT SHOULD.
//
// getCart awaits the full cart query and returns `{ success: true }`, throwing
// the result away. The frontend types the response `Product[]` and passes it
// to mergeCartItems, which tests `backendItems.length > 0` - on an object that
// is `undefined > 0`, so it silently merges nothing and never throws.
//
// The effect is that a saved buy cart is not restored on login. Production
// holds 17 buy carts, 3 of them with items. The sell cart equivalent DOES
// return its items, which is what makes this look like an oversight rather
// than a decision - but it is a decision either way, so it is D23 and not a
// change made at four in the morning.
//
// If that is decided, this assertion becomes `Array.isArray(res.body)` and the
// two lines above it go away.
test("get_cart returns the customer's saved buy cart", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { product, productId } = await products(client);
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: productId, quantity: 2 }] });

      const res = await request(app).get("/api/cart/get_cart");

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      // AN ARRAY, not { success: true }. hydrateCarts types this Product[] and
      // hands it to mergeCart, which iterates it - an object threw a TypeError
      // that the try/catch around hydration swallowed into a console.error, so
      // every login silently lost the buy cart.
      assert.ok(
        Array.isArray(res.body),
        `get_cart must answer an array the frontend can iterate, got ${JSON.stringify(res.body)}`
      );
      assert.ok(
        res.body.some((r) => r.id === product.id || r.product_id === product.id),
        "the product just synced is not in the returned cart"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// A CART MAY ONLY HOLD PRODUCTS THAT ARE LIVE IN THAT DIRECTION.
//
// The storefront only ever shows live products, so the frontend never asks for
// a hidden one - but these routes take a product id from the request body and
// nothing checked it. Twenty-five products carry a zero ask premium and would
// price at nothing; none is displayed, which is the ONLY thing that was
// stopping one reaching a cart.
//
// These fixtures are chosen by flag rather than hard-coded, and asserted to
// exist, because a fixture that silently resolves to undefined turns every
// assertion below into a test of nothing.
// The customer in dev may already own a cart, so "nothing was written" cannot
// be asserted as "the cart is empty" - that was the first version of these
// tests and it failed against real data. The property is that a REFUSED sync
// leaves the cart exactly as it found it.
const cartOf = async (client: PoolClient) => {
  const { rows } = await client.query(
    `SELECT ci.bullion_id::text AS product_id, ci.quantity
       FROM checkout.items ci
       JOIN checkout.checkouts c ON c.id = ci.checkout_id
      WHERE c.user_id = $1 AND c.direction = 'sale'
      ORDER BY ci.bullion_id`,
    [customer.id]
  );
  return JSON.stringify(rows);
};

// The fixtures are BUILT to this flag now rather than found with it, so
// what is left to check is that the builder really writes what it was asked -
// the one thing a fixture library can get silently wrong.
test("the fixtures for these cases really are what they claim", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { product, hidden } = await products(client);
    const { rows } = await client.query(
      `SELECT id, display FROM products.bullion WHERE id = ANY($1)`,
      [[product.id, hidden.id]]
    );
    const by = new Map(rows.map((r) => [r.id, r]));
    assert.equal(by.get(hidden.id)!.display, false, "the hidden fixture is not hidden");
    assert.equal(by.get(product.id)!.display, true, "the live fixture is not live");
  }, { actor: TEST_ACTOR.id });
});

test("sync_cart refuses a product that is not displayed", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { product, productId, hiddenId } = await products(client);
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const before = await cartOf(client);

      const res = await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: hiddenId, quantity: 1 }] });

      // 422, NOT 400 (D214 item 11): "that product is not available" is a rule
      // the domain refuses, and a domain refusal is Invalid.
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(await cartOf(client), before, "a refused sync changed the cart");
      assert.ok(!before.includes(hiddenId), "the hidden product reached the cart");
    });
  }, { actor: TEST_ACTOR.id });
});

// The whole sync is refused, not the offending line quietly dropped. Dropping
// it would leave the customer with a cart they did not ask for and no error.
test("one bad line refuses the whole sync, and nothing is written", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { product, productId, hiddenId } = await products(client);
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const before = await cartOf(client);

      const res = await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: productId, quantity: 2 }, { id: hiddenId, quantity: 1 }] });

      // 422, NOT 400 (D214 item 11): "that product is not available" is a rule
      // the domain refuses, and a domain refusal is Invalid.
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(
        await cartOf(client),
        before,
        "the good line was written even though the sync was refused"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// An id that names nothing is refused the same way a hidden one is. Answering
// differently would confirm which ids exist to a caller guessing them.
test("sync_cart refuses an id that names no product", async () => {
  await inPinnedTransaction(async () => {
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const res = await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: randomUUID(), quantity: 1 }] });
      // 422, NOT 400 (D214 item 11): "that product is not available" is a rule
      // the domain refuses, and a domain refusal is Invalid.
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  }, { actor: TEST_ACTOR.id });
});

// THE SELL SIDE HAS NO GATE (Jacob, 2026-09-03, ruling 49). `display` still
// gates the buy side only, so a product the buy side hides is still fair
// game for the sell cart - the check that remains is existence, not the
// dropped `sell_display` flag.
test("sync_sell_cart accepts a product the buy side hides, and refuses an id that names no product", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { hidden, hiddenId } = await products(client);
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const ok = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({
          cart: [{ type: "product", quantity: 1, data: { id: hiddenId, name: hidden.product_name } }],
        });
      assert.equal(ok.status, 200, `answered ${ok.status}: ${JSON.stringify(ok.body)}`);

      const { rows } = await client.query(
        `SELECT ci.bullion_id AS product_id
           FROM checkout.items ci
           JOIN checkout.checkouts c ON c.id = ci.checkout_id
          WHERE c.user_id = $1 AND c.direction = 'purchase' AND ci.bullion_id IS NOT NULL`,
        [customer.id]
      );
      assert.equal(rows.length, 1, "the hidden product did not land in the sell cart");
      assert.equal(rows[0].product_id, hiddenId);

      const res = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({ cart: [{ type: "product", quantity: 1, data: { id: randomUUID() } }] });
      // 422, NOT 400 (D214 item 11): "that product is not available" is a rule
      // the domain refuses, and a domain refusal is Invalid.
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  }, { actor: TEST_ACTOR.id });
});

// A scrap line names no product, so it has nothing to check and must still be
// accepted - the guard must not refuse the sell cart's main case.
test("a scrap line is unaffected by the product check", async () => {
  await inPinnedTransaction(async () => {
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const res = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({
          cart: [{ type: "scrap", quantity: 1, data: { id: randomUUID(), metal: "Gold", pre_melt: 1 } }],
        });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  }, { actor: TEST_ACTOR.id });
});

// D73. The frontend's sell-cart line is { type: "product", data: {...} }, and
// both repos read a TOP-LEVEL product_name that shape never had - so every
// product line in a synced sell cart was skipped by a bare `continue`, while
// the scrap branch (which always read item.data) worked. A cart of one coin
// and one ring synced as just the ring, silently. This sends the frontend's
// real shape, post-conversion spelling, and proves the product line lands.
test("sync_sell_cart stores a product line sent in the frontend's own shape", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { product, productId, hiddenId } = await products(client);
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const res = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({
          cart: [
            {
              type: "product",
              // `product` is the fixture asserted present in beforeAll(); the sell
              // direction has no liveness refusal to dodge.
              data: { name: product.product_name, quantity: 2 },
            },
          ],
        });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const next = await client.query(
        `SELECT i.quantity
           FROM checkout.items i
           JOIN checkout.checkouts c ON c.id = i.checkout_id
          WHERE c.user_id = $1 AND i.bullion_id IS NOT NULL AND c.direction = 'purchase'`,
        [customer.id]
      );
      assert.equal(next.rows.length, 1, "the product line was skipped again - D73 is back");
      assert.equal(Number(next.rows[0].quantity), 2, "the data.quantity was not read");
    });
  }, { actor: TEST_ACTOR.id });
});
