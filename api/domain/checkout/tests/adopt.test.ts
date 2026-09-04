// SIGNING IN KEEPS THE BASKET (ruling 63), against the real tables.
//
// rules.test.ts pins the merge DECISION without a database; this pins what the
// decision does to rows - which row survives, where the lines end up, and that
// the visitor leaves nothing behind for the sweep to find.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import {
  aCart, aProduct, aUser, aVisitor, anAddress, packageId, carrierServiceId,
} from "#shared/testing/builders/index.ts";
import * as checkouts from "#db/checkout/checkouts/repo.ts";
import * as checkoutItems from "#db/checkout/items/repo.ts";
import * as userAddresses from "#db/places/user-addresses/repo.ts";
import { adoptAnonymousCheckout } from "#domain/checkout/adopt.ts";
import { CHOICE_COLUMNS } from "#domain/checkout/rules.ts";

afterAll(async () => { await pool.end(); });

const LOCKS_HERE = [LOCKS.ORDERS, LOCKS.ADDRESSES];

test("the merge's subject is exactly the repo's patch surface", () => {
  // rules.ts restates checkouts.PATCHABLE rather than importing it, so that the
  // rules module stays out of the database test lane. This is the pin that
  // makes the copy honest: a column added to PATCHABLE and forgotten in
  // CHOICE_COLUMNS would silently stop being carried across a sign-in.
  const patchable: readonly string[] = checkouts.PATCHABLE;
  assert.deepEqual([...CHOICE_COLUMNS].sort(), [...patchable].sort());
});

test("a visitor's only checkout changes hands, id and lines and all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    const customer = await aUser(c);
    const product = await aProduct(c);
    const cart = await aCart(c, visitor, { direction: "purchase" }).withBullion(product, 3);

    const result = await adoptAnonymousCheckout(
      { anonymousUserId: visitor.id, userId: customer.id }, c
    );

    assert.deepEqual(result.adopted, [
      { direction: "purchase", outcome: "moved", checkout_id: cart.id, replaced: 0 },
    ]);
    // RE-KEYED, NOT COPIED: the same row id is now the customer's, so anything
    // already holding that id (the open page's own cache) still resolves.
    const mine = await checkouts.findFor(customer.id, "purchase", c);
    assert.equal(mine?.id, cart.id);
    assert.equal(await checkouts.findFor(visitor.id, "purchase", c), undefined);
    const lines = await checkoutItems.listFor(cart.id, c);
    assert.equal(lines.length, 1);
    assert.equal(Number(lines[0].quantity), 3);
  }, { actor: TEST_ACTOR.id, lock: LOCKS_HERE });
});

test("both directions follow, not just the one being looked at", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    const customer = await aUser(c);
    const product = await aProduct(c);
    await aCart(c, visitor, { direction: "purchase" }).withLots(1);
    await aCart(c, visitor, { direction: "sale" }).withBullion(product, 1);

    const result = await adoptAnonymousCheckout(
      { anonymousUserId: visitor.id, userId: customer.id }, c
    );

    assert.equal(result.adopted.length, 2);
    assert.deepEqual(
      result.adopted.map((r) => r.direction).sort(), ["purchase", "sale"]
    );
    assert.ok(await checkouts.findFor(customer.id, "purchase", c));
    assert.ok(await checkouts.findFor(customer.id, "sale", c));
  }, { actor: TEST_ACTOR.id, lock: LOCKS_HERE });
});

test("when the customer already has a row, theirs survives and takes the visitor's basket", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    const customer = await aUser(c);
    const product = await aProduct(c);
    const box = await packageId(c, "Small Box");
    const service = await carrierServiceId(c, "Express Saver");

    // The customer's own row, from a previous visit, with a saved package.
    const mine = await aCart(c, customer, { direction: "purchase" })
      .withLots(2)
      .withRow({ package_id: box });
    // The visitor's row: a different basket and a service the customer never
    // chose.
    const theirs = await aCart(c, visitor, { direction: "purchase" })
      .withBullion(product, 1)
      .withRow({ carrier_service_id: service });

    const result = await adoptAnonymousCheckout(
      { anonymousUserId: visitor.id, userId: customer.id }, c
    );

    assert.deepEqual(result.adopted, [
      { direction: "purchase", outcome: "merged", checkout_id: mine.id, replaced: 2 },
    ]);

    const survivor = await checkouts.findFor(customer.id, "purchase", c);
    assert.equal(survivor?.id, mine.id, "the customer's row is the one that survives");
    // The visitor's choice landed; the customer's saved one was not blanked.
    assert.equal(survivor?.carrier_service_id, service);
    assert.equal(survivor?.package_id, box);

    // THE BASKET REPLACES rather than merges - it is the set the customer is
    // looking at. Two lots gone, one bullion line in their place.
    const lines = await checkoutItems.listFor(mine.id, c);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].bullion_id, product.id);

    // Nothing is left for the sweep.
    assert.equal(await checkouts.findFor(visitor.id, "purchase", c), undefined);
    assert.equal((await checkouts.getOne(theirs.id, c)), undefined);
  }, { actor: TEST_ACTOR.id, lock: LOCKS_HERE });
});

test("the address the visitor typed lands in the customer's book", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    const customer = await aUser(c);
    const address = await anAddress(c, visitor);

    const result = await adoptAnonymousCheckout(
      { anonymousUserId: visitor.id, userId: customer.id }, c
    );

    assert.equal(result.addresses, 1);
    const book = await userAddresses.listFor(customer.id, c);
    assert.ok(
      book.some((entry) => entry.address_id === address.id),
      "the address a visitor entered mid-checkout is the customer's afterwards - " +
        "without this, patchCheckout refuses the address their own row points at"
    );
    assert.deepEqual(await userAddresses.listFor(visitor.id, c), []);
  }, { actor: TEST_ACTOR.id, lock: LOCKS_HERE });
});

test("linking a user to itself does nothing at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const cart = await aCart(c, customer, { direction: "purchase" }).withLots(1);
    const result = await adoptAnonymousCheckout(
      { anonymousUserId: customer.id, userId: customer.id }, c
    );
    assert.deepEqual(result, { adopted: [], addresses: 0 });
    assert.equal((await checkouts.getOne(cart.id, c))?.user_id, customer.id);
  }, { actor: TEST_ACTOR.id, lock: LOCKS_HERE });
});

test("a visitor with nothing to carry is not an error", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    const customer = await aUser(c);
    const result = await adoptAnonymousCheckout(
      { anonymousUserId: visitor.id, userId: customer.id }, c
    );
    assert.deepEqual(result, { adopted: [], addresses: 0 });
  }, { actor: TEST_ACTOR.id, lock: LOCKS_HERE });
});
