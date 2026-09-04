// THE VISITORS NOBODY CAME BACK FOR.
//
// Ruling 63 mints an auth.users row for anyone who touches a basket, and the
// anonymous plugin is configured NOT to delete them on sign-in
// (domain/auth/client.ts says why), so this sweep is the only thing that ever
// removes one. Two properties matter and both are pinned below: it takes every
// trace of a stale visitor, and it cannot touch a customer.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { aCart, aUser, aVisitor, anAddress } from "#shared/testing/builders/index.ts";
import { sweepAnonymousVisitors, STALE_AFTER_DAYS } from "#domain/checkout/sweep.ts";

afterAll(async () => { await pool.end(); });

const HERE = [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS];

// TIME MOVES FORWARD, NOT BACKWARD. Backdating the fixtures is not available:
// migration 116's audit trigger rewrites `updated_at` on every UPDATE, so a
// statement that tried to age a basket line would stamp it with the moment it
// ran. Moving `now` instead is the same arithmetic and needs no fighting with
// the trigger.
const daysLater = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const exists = async (c: PoolClient, sql: string, id: string): Promise<boolean> =>
  (await c.query(sql, [id])).rows.length > 0;

test("a stale visitor goes, and takes their checkout, basket and address book", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    const address = await anAddress(c, visitor);
    const cart = await aCart(c, visitor, { direction: "purchase" }).withLots(2);

    const result = await sweepAnonymousVisitors(
      { now: daysLater(STALE_AFTER_DAYS + 1) }, c
    );

    assert.ok(result.deleted.includes(visitor.id), "the visitor was swept");
    assert.equal(
      await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, visitor.id), false
    );
    assert.equal(
      await exists(c, `SELECT 1 FROM checkout.checkouts WHERE id = $1`, cart.id), false
    );
    assert.equal(
      await exists(c, `SELECT 1 FROM checkout.items WHERE checkout_id = $1`, cart.id),
      false, "the lines went with the session, by cascade"
    );
    assert.equal(
      await exists(c, `SELECT 1 FROM places.user_addresses WHERE user_id = $1`, visitor.id),
      false
    );
    // The ADDRESS itself stays: places.addresses rows are shared, and this
    // sweep deletes the visitor's claim on one, not the row.
    assert.equal(
      await exists(c, `SELECT 1 FROM places.addresses WHERE id = $1`, address.id), true
    );
  }, { actor: TEST_ACTOR.id, lock: HERE });
});

test("a visitor who is still shopping is left alone", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    await aCart(c, visitor, { direction: "purchase" }).withLots(1);

    const result = await sweepAnonymousVisitors({}, c);

    assert.ok(!result.deleted.includes(visitor.id), "a visitor from a moment ago stays");
    assert.equal(
      await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, visitor.id), true
    );
  }, { actor: TEST_ACTOR.id, lock: HERE });
});

test("a customer is never a candidate, however old their account", async () => {
  // THE ONE THAT MATTERS. This is the only DELETE of a user row in the
  // codebase; the `isAnonymous` clause in both the listing and the delete is
  // what makes it incapable of reaching a customer. A cutoff far in the future
  // makes EVERY row stale by date, so only that clause is left doing the work.
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    await aCart(c, customer, { direction: "purchase" }).withLots(1);

    const result = await sweepAnonymousVisitors({ now: daysLater(3650) }, c);

    assert.ok(
      !result.deleted.includes(customer.id),
      "a customer was swept - the isAnonymous guard is gone"
    );
    assert.equal(
      await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, customer.id), true
    );
  }, { actor: TEST_ACTOR.id, lock: HERE });
});

test("naming a customer's id directly still deletes nothing", async () => {
  // The repo's own guard, past the listing: the statement filters on
  // isAnonymous itself, so a caller that somehow assembled the wrong batch
  // removes nobody rather than removing a customer.
  const { anonymousUsers } = await import("#db");
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const removed = await anonymousUsers.remove([customer.id], c);
    assert.deepEqual(removed, []);
    assert.equal(
      await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, customer.id), true
    );
  }, { actor: TEST_ACTOR.id, lock: HERE });
});

test("an empty sweep is not an error and writes nothing", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // A cutoff before any row in the database exists.
    const result = await sweepAnonymousVisitors({ now: new Date(0) }, c);
    assert.deepEqual(result, { considered: 0, deleted: [] });
  }, { actor: TEST_ACTOR.id, lock: HERE });
});
