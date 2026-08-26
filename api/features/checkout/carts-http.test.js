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
