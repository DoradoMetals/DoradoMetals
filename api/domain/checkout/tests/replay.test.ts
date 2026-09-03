// The cart endpoints, over real HTTP.
//
// THESE FOUR WERE PUBLIC, and it was demonstrated rather than deduced: no
// session, no cookie, GET /api/cart/get_sell_cart?user_id=<somebody> answered
// 200 with their two items. These tests keep it shut - anonymous is refused,
// and the id in the request is ignored in favour of the session's.
//
// Fixtures are SELF-SEEDED over the same HTTP surface, inside the rolled-back
// transaction, so every assertion stands on data this file put there.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

// checkout.checkouts and checkout.items are written by the checkout repo
// tests too, so this shares their group.
const CART_LOCK = LOCKS.ORDERS;

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type Caller = UserFixture & { role: string };

let owner: Caller;
let stranger: Caller;

before(async () => {
  // Two non-admin users that exist in BOTH exchange.users and auth.users -
  // checkout.checkouts.user_id has an FK to auth.users, so a fixture missing
  // there makes every seed insert fail with a 500 rather than the 200 these
  // tests expect.
  const users = await outside<UserFixture>(
    `SELECT u.id, u.name, u.email FROM exchange.users u
      WHERE u.role IS DISTINCT FROM 'admin'
        AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
      ORDER BY u.email LIMIT 2`
  );
  assert.ok(users.length >= 2, "dev needs two non-admin users present in auth.users");
  owner = Object.assign({}, users[0], { role: "user" });
  stranger = Object.assign({}, users[1], { role: "user" });
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// Seeds the owner's own sell cart with one scrap line, over the real route -
// the same shape carts-http.test.ts sends. Returns the count so callers can
// assert against it rather than a hardcoded 1.
async function seedOwnerCart(): Promise<number> {
  const res = await as(owner, () =>
    request(app)
      .post("/api/cart/sync_sell_cart")
      .send({
        cart: [
          {
            type: "scrap",
            quantity: 1,
            data: {
              id: randomUUID(),
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
      })
  );
  assert.equal(res.status, 200, `seeding the owner's cart failed: ${JSON.stringify(res.body)}`);
  return 1;
}

async function ownerCartCount(client: PoolClient): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM checkout.items ci
       JOIN checkout.checkouts c ON c.id = ci.checkout_id
      WHERE c.user_id = $1 AND c.direction = 'purchase'`,
    [owner.id]
  );
  return rows[0].n;
}

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
  await inPinnedTransaction(async (client: PoolClient) => {
    const seeded = await seedOwnerCart();
    assert.equal(await ownerCartCount(client), seeded, "the seed did not land");

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
        seeded,
        "the owner got somebody else's cart by naming them"
      );
    });
  }, { lock: CART_LOCK });
});

test("a stranger cannot replace somebody else's cart by naming them", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const seeded = await seedOwnerCart();

    await as(stranger, async () => {
      const res = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({ user_id: owner.id, cart: [] });
      assert.equal(res.status, 200, "the sync itself should succeed - for the stranger");
    });

    // The owner's cart is untouched: the emptying landed on the stranger's own.
    assert.equal(
      await ownerCartCount(client),
      seeded,
      "a stranger emptied somebody else's cart"
    );
  }, { lock: CART_LOCK });
});

test("the owner can still read and sync their own cart", async () => {
  await inPinnedTransaction(async () => {
    const seeded = await seedOwnerCart();

    await as(owner, async () => {
      const read = await request(app).get("/api/cart/get_sell_cart");
      assert.equal(read.status, 200, "the owner was refused their own cart");
      assert.ok(Array.isArray(read.body) && read.body.length === seeded);

      const synced = await request(app)
        .post("/api/cart/sync_sell_cart")
        .send({ cart: [] });
      assert.equal(synced.status, 200, JSON.stringify(synced.body));
    });
  }, { lock: CART_LOCK });
});
