// The basket endpoints' guards. Anonymous is refused; a foreign user_id is
// admin-only. Fixtures are self-seeded over the same HTTP surface.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { anId, aUser, metalId, type BuiltUser } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

// checkout.checkouts and checkout.items are written by the checkout repo
// tests too, so this shares their group.
const CART_LOCK = LOCKS.ORDERS;

type Caller = { id: string; name: string | null; email: string | null; role: string };

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// checkout.checkouts.user_id has an FK to auth.users, so the caller must be a
// REAL row there - built fresh per test rather than discovered from
// exchange.users, since `aUser` writes auth.users directly (and the identity
// mirror keeps exchange.users in step, which is what the old discovery relied
// on without saying so).
const asCaller = (u: BuiltUser): Caller => ({ id: u.id, name: u.name, email: u.email, role: "user" });

async function seedOwnerCart(client: PoolClient, owner: Caller): Promise<number> {
  const metal_id = await metalId(client, "Gold");
  const res = await as(owner, () =>
    request(app)
      .put("/api/checkout/items")
      .query({ direction: "purchase" })
      .send({
        items: [
          { metal_id, pre_melt: 2.5, post_melt: 2.4, purity: 0.75, unit: "t oz", quantity: 1 },
        ],
      })
  );
  assert.equal(res.status, 200, `seeding the owner's basket failed: ${JSON.stringify(res.body)}`);
  return 1;
}

async function ownerCartCount(client: PoolClient, owner: Caller): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM checkout.items ci
       JOIN checkout.checkouts c ON c.id = ci.checkout_id
      WHERE c.user_id = $1 AND c.direction = 'purchase'`,
    [owner.id]
  );
  return rows[0].n;
}

test("an anonymous caller cannot read a cart, whoever they name", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const direction of ["purchase", "sale"]) {
        const res = await request(app)
          .get("/api/checkout/items")
          .query({ direction, user_id: anId() });
        assert.ok(
          [401, 403].includes(res.status),
          `the ${direction} basket answered ${res.status} to a request with no session`
        );
      }
    });
  }, { actor: TEST_ACTOR.id, lock: CART_LOCK });
});

test("an anonymous caller cannot replace or empty a cart", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const direction of ["purchase", "sale"]) {
        const put = await request(app)
          .put("/api/checkout/items")
          .query({ direction, user_id: anId() })
          .send({ items: [] });
        assert.ok(
          [401, 403].includes(put.status),
          `PUT ${direction} answered ${put.status} to a request with no session`
        );
        const del = await request(app)
          .delete("/api/checkout/items")
          .query({ direction, user_id: anId() });
        assert.ok(
          [401, 403].includes(del.status),
          `DELETE ${direction} answered ${del.status} to a request with no session`
        );
      }
    });
  }, { actor: TEST_ACTOR.id, lock: CART_LOCK });
});

// The read REFUSES a foreign user_id now, where it used to answer your own.
test("a signed-in caller naming somebody else is refused, and still gets their own", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const owner = asCaller(await aUser(client));
    const stranger = asCaller(await aUser(client));
    const seeded = await seedOwnerCart(client, owner);
    assert.equal(await ownerCartCount(client, owner), seeded, "the seed did not land");

    await as(stranger, async () => {
      const res = await request(app)
        .get("/api/checkout/items")
        .query({ direction: "purchase", user_id: owner.id });
      assert.equal(
        res.status, 403,
        "asking for somebody else's basket was not refused - the request's user_id is being obeyed"
      );
    });

    await as(owner, async () => {
      // Naming yourself is a no-op.
      const own = await request(app)
        .get("/api/checkout/items")
        .query({ direction: "purchase", user_id: owner.id });
      assert.equal(own.status, 200, "the owner was refused their own basket by naming themselves");
      assert.equal(own.body.length, seeded);

      const res = await request(app)
        .get("/api/checkout/items")
        .query({ direction: "purchase", user_id: stranger.id });
      assert.equal(
        res.status, 403,
        "the owner reached somebody else's basket by naming them"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: CART_LOCK });
});

test("a stranger cannot replace somebody else's cart by naming them", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const owner = asCaller(await aUser(client));
    const stranger = asCaller(await aUser(client));
    const seeded = await seedOwnerCart(client, owner);

    await as(stranger, async () => {
      const res = await request(app)
        .put("/api/checkout/items")
        .query({ direction: "purchase", user_id: owner.id })
        .send({ items: [] });
      assert.equal(res.status, 403, "a non-admin naming somebody else's basket was not refused");
    });

    // The owner's cart is untouched: the sync never ran, admin-only refused it.
    assert.equal(
      await ownerCartCount(client, owner),
      seeded,
      "a stranger emptied somebody else's cart"
    );
  }, { actor: TEST_ACTOR.id, lock: CART_LOCK });
});

test("the owner can still read and sync their own cart", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const owner = asCaller(await aUser(client));
    const seeded = await seedOwnerCart(client, owner);

    await as(owner, async () => {
      const read = await request(app)
        .get("/api/checkout/items")
        .query({ direction: "purchase" });
      assert.equal(read.status, 200, "the owner was refused their own basket");
      assert.ok(Array.isArray(read.body) && read.body.length === seeded);

      const synced = await request(app)
        .put("/api/checkout/items")
        .query({ direction: "purchase" })
        .send({ items: [] });
      assert.equal(synced.status, 200, JSON.stringify(synced.body));
    });
  }, { actor: TEST_ACTOR.id, lock: CART_LOCK });
});
