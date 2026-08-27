// The cart endpoints, over real HTTP.
//
// These four were PUBLIC until this file was written, and the reason on the
// list - "a cart belongs to a browser, not an account - a signed-out visitor
// has one" - was true of the browser-local store and not of the endpoints. They
// took a user id out of the request and had no guard at all, so an anonymous
// caller with somebody's id could read their sell cart and replace it.
//
// That was demonstrated with a real request before anything changed: no
// session, no cookie, GET /api/cart/get_sell_cart?user_id=<somebody> returned
// 200 and their two items. exchange.sell_carts holds 65 rows in production.
//
// So these tests exist to keep it shut: anonymous is refused, and the id in the
// request is ignored in favour of the session's.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, assertNothingEscaped, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

// checkout.checkouts and exchange.sell_carts are written by the checkout repo
// tests too, so this shares their group.
const CART_LOCK = LOCKS.ORDERS;

let owner;
let stranger;

before(async () => {
  // The user with the most sell-cart items, so a leak would actually show
  // something rather than an empty array that proves nothing either way.
  const carts = await outside(
    `SELECT sc.user_id, count(*)::int AS n
       FROM exchange.sell_carts sc
       JOIN exchange.sell_cart_items i ON i.cart_id = sc.id
      GROUP BY sc.user_id
      ORDER BY n DESC, sc.user_id ASC
      LIMIT 1`
  );
  assert.ok(carts.length, "dev has no sell cart with items - this proves nothing");
  assert.ok(carts[0].n > 0);

  const owners = await outside(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
    carts[0].user_id,
  ]);
  owner = { ...owners[0], role: "user" };
  assert.ok(owner.id, `no exchange.users row for ${carts[0].user_id}`);

  const others = await outside(
    `SELECT id, name, email FROM exchange.users WHERE id <> $1 LIMIT 1`,
    [owner.id]
  );
  stranger = { ...others[0], role: "user" };
  assert.ok(stranger.id, "dev has only one user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// The exposure as it actually was: no session at all.
test("an anonymous caller cannot read a cart, whoever they name", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const path of ["/api/cart/get_sell_cart", "/api/cart/get_cart"]) {
        const res = await request(app).get(path).query({ user_id: owner.id });
        assert.ok(
          [401, 403].includes(res.status),
          `${path} answered ${res.status} to a request with no session`
        );
      }
    });
  }, { lock: CART_LOCK });
});

test("an anonymous caller cannot replace a cart", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const path of ["/api/cart/sync_sell_cart", "/api/cart/sync_cart"]) {
        const res = await request(app).post(path).send({ user_id: owner.id, cart: [] });
        assert.ok(
          [401, 403].includes(res.status),
          `${path} answered ${res.status} to a request with no session`
        );
      }
    });
  }, { lock: CART_LOCK });
});

// The other half: signed in, but naming somebody else. The id in the request
// must be ignored rather than obeyed.
test("a signed-in caller naming somebody else gets their own cart, not theirs", async () => {
  await inPinnedTransaction(async () => {
    const owned = await outside(
      `SELECT count(*)::int AS n FROM exchange.sell_carts sc
         JOIN exchange.sell_cart_items i ON i.cart_id = sc.id
        WHERE sc.user_id = $1`,
      [owner.id]
    );
    assert.ok(owned[0].n > 0, "the owner has no items, so a leak would look like a pass");

    await as(stranger, async () => {
      const res = await request(app)
        .get("/api/cart/get_sell_cart")
        .query({ user_id: owner.id });
      assert.equal(res.status, 200);
      assert.equal(
        res.body.length,
        0,
        "asking for somebody else's cart returned it - the request's user_id is being obeyed"
      );
    });

    await as(owner, async () => {
      const res = await request(app)
        .get("/api/cart/get_sell_cart")
        .query({ user_id: stranger.id });
      assert.equal(res.status, 200);
      assert.equal(
        res.body.length,
        owned[0].n,
        "the owner got somebody else's cart by naming them"
      );
    });
  }, { lock: CART_LOCK });
});

test("a stranger cannot replace somebody else's cart by naming them", async () => {
  await inPinnedTransaction(async () => {
    await as(stranger, async () => {
      const res = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({ user_id: owner.id, cart: [] });
      assert.equal(res.status, 200, "the sync itself should succeed - for the stranger");
    });

    // The owner's cart is untouched: the emptying landed on the stranger's own.
    const after = await outside(
      `SELECT count(*)::int AS n FROM exchange.sell_carts sc
         JOIN exchange.sell_cart_items i ON i.cart_id = sc.id
        WHERE sc.user_id = $1`,
      [owner.id]
    );
    assert.ok(after[0].n > 0, "a stranger emptied somebody else's cart");
  }, { lock: CART_LOCK });
});

test("the owner can still read and sync their own cart", async () => {
  await inPinnedTransaction(async () => {
    await as(owner, async () => {
      const read = await request(app).get("/api/cart/get_sell_cart");
      assert.equal(read.status, 200, "the owner was refused their own cart");
      assert.ok(Array.isArray(read.body) && read.body.length > 0);

      const synced = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({ cart: [] });
      assert.equal(synced.status, 200, JSON.stringify(synced.body));
    });
  }, { lock: CART_LOCK });
});

test("nothing this file did survived the transaction", async () => {
  const [{ n }] = await outside(
    `SELECT count(*)::int AS n FROM exchange.sell_carts sc
       JOIN exchange.sell_cart_items i ON i.cart_id = sc.id
      WHERE sc.user_id = $1`,
    [owner.id]
  );
  assert.ok(n > 0, "the owner's cart was really emptied in dev");
});
