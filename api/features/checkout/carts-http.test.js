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
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

await mockSessions();
const { default: app } = await import("#app");

let customer;
let product;
let hidden;
let notSellable;
// The frontend generates a UUID per local scrap line and the backend stores it
// AS the scrap row's id, so this cannot be an arbitrary string - a plain
// "local-1" is rejected by the column type, which is how I learned it.
const scrapId = randomUUID();

before(async () => {
  customer = (
    await outside(
      `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
    )
  )[0];
  assert.ok(customer, "dev has no non-admin user");

  // EACH FIXTURE IS CHOSEN TO DISCRIMINATE THE TWO FLAGS, not merely to be
  // hidden. The first version took "any product with display = false" and "any
  // with sell_display = false", and both happened to be false in BOTH
  // directions - so swapping the flags in the guard passed every test. A test
  // that cannot tell the two apart is not testing which one is checked.
  //
  // So: the buy-cart fixture is hidden for buying but LIVE for selling, and the
  // sell-cart fixture is the reverse. Now checking the wrong flag lets it
  // through and the test fails.
  hidden = (
    await outside(
      `SELECT id, product_name FROM exchange.products
        WHERE display IS NOT TRUE AND sell_display IS TRUE ORDER BY id LIMIT 1`
    )
  )[0];
  notSellable = (
    await outside(
      `SELECT id, product_name FROM exchange.products
        WHERE display IS TRUE AND sell_display IS NOT TRUE ORDER BY id LIMIT 1`
    )
  )[0];

  product = (
    await outside(`SELECT id, product_name FROM exchange.products ORDER BY id LIMIT 1`)
  )[0];
  assert.ok(product, "dev has no products");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("sync_cart replaces the customer's buy cart", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: product.id, quantity: 3 }] });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT ci.product_id, ci.quantity
           FROM exchange.cart_items ci
           JOIN exchange.carts c ON c.id = ci.cart_id
          WHERE c.user_id = $1`,
        [customer.id]
      );
      assert.equal(rows.length, 1, "the cart does not hold exactly the one line sent");
      assert.equal(rows[0].product_id, product.id, "a different product was stored");
      assert.equal(Number(rows[0].quantity), 3, "the quantity was not stored");
    });
  });
});

// REPLACES, not appends - the name says so and it is the behaviour the frontend
// relies on when it pushes its local cart up.
test("sync_cart replaces rather than appends", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...customer, role: "user" }, async () => {
      await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: product.id, quantity: 3 }] });
      await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: product.id, quantity: 1 }] });

      const { rows } = await client.query(
        `SELECT ci.quantity FROM exchange.cart_items ci
           JOIN exchange.carts c ON c.id = ci.cart_id
          WHERE c.user_id = $1`,
        [customer.id]
      );
      assert.equal(rows.length, 1, "the second sync added a line instead of replacing");
      assert.equal(Number(rows[0].quantity), 1, "the cart kept the first quantity");
    });
  });
});

test("sync_sell_cart stores a scrap line with its own values", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...customer, role: "user" }, async () => {
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
        `SELECT s.purity, s.pre_melt
           FROM exchange.sell_cart_items sci
           JOIN exchange.sell_carts sc ON sc.id = sci.cart_id
           JOIN exchange.scrap s ON s.id = sci.scrap_id
          WHERE sc.user_id = $1`,
        [customer.id]
      );
      assert.equal(rows.length, 1, "the sell cart does not hold exactly the one scrap line");
      assert.equal(Number(rows[0].purity), 0.75, "the purity was not stored");
      assert.equal(Number(rows[0].pre_melt), 2.5, "the weight was not stored");
    });
  });
});

test("get_sell_cart returns what sync_sell_cart stored", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
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
  });
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
test("get_cart answers success and returns no cart - see D23", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: product.id, quantity: 2 }] });

      const res = await request(app).get("/api/cart/get_cart");

      assert.equal(res.status, 200, `answered ${res.status}`);
      assert.equal(
        Array.isArray(res.body),
        false,
        "get_cart now returns a list - if that was deliberate, update D23 and this test"
      );
      assert.deepEqual(res.body, { success: true }, "the response shape changed");
    });
  });
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
const cartOf = async (client) => {
  const { rows } = await client.query(
    `SELECT ci.product_id::text, ci.quantity
       FROM exchange.cart_items ci
       JOIN exchange.carts c ON c.id = ci.cart_id
      WHERE c.user_id = $1
      ORDER BY ci.product_id`,
    [customer.id]
  );
  return JSON.stringify(rows);
};

test("the fixtures for these cases really are what they claim", () => {
  assert.ok(
    hidden,
    "dev has no product that is hidden for buying but live for selling - " +
      "without one, this suite cannot tell which flag the buy guard reads"
  );
  assert.ok(
    notSellable,
    "dev has no product that is live for buying but hidden for selling - " +
      "without one, this suite cannot tell which flag the sell guard reads"
  );
  assert.ok(product, "dev has no product at all");
  assert.notEqual(hidden.id, product.id, "the hidden fixture is the live one");
  assert.notEqual(notSellable.id, hidden.id, "the two fixtures are the same row");
});

test("sync_cart refuses a product that is not displayed", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...customer, role: "user" }, async () => {
      const before = await cartOf(client);

      const res = await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: hidden.id, quantity: 1 }] });

      assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(await cartOf(client), before, "a refused sync changed the cart");
      assert.ok(!before.includes(hidden.id), "the hidden product reached the cart");
    });
  });
});

// The whole sync is refused, not the offending line quietly dropped. Dropping
// it would leave the customer with a cart they did not ask for and no error.
test("one bad line refuses the whole sync, and nothing is written", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...customer, role: "user" }, async () => {
      const before = await cartOf(client);

      const res = await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: product.id, quantity: 2 }, { id: hidden.id, quantity: 1 }] });

      assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(
        await cartOf(client),
        before,
        "the good line was written even though the sync was refused"
      );
    });
  });
});

// An id that names nothing is refused the same way a hidden one is. Answering
// differently would confirm which ids exist to a caller guessing them.
test("sync_cart refuses an id that names no product", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/cart/sync_cart")
        .send({ cart: [{ id: randomUUID(), quantity: 1 }] });
      assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  });
});

// The two directions are separate flags. A product can be sellable to the
// business without being displayed for sale by it, so neither is a proxy for
// the other and the sell cart is checked against its own.
test("sync_sell_cart refuses a product line that is not sell_display", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({ cart: [{ type: "product", quantity: 1, data: { id: notSellable.id } }] });
      assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  });
});

// A scrap line names no product, so it has nothing to check and must still be
// accepted - the guard must not refuse the sell cart's main case.
test("a scrap line is unaffected by the product check", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({
          cart: [{ type: "scrap", quantity: 1, data: { id: randomUUID(), metal: "Gold", pre_melt: 1 } }],
        });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  });
});
