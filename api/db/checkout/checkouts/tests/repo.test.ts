import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import type { Direction } from "@dorado/contracts";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { aUser, anAddress } from "#shared/testing/builders/index.ts";
import * as userAddresses from "#db/places/user-addresses/repo.ts";
import * as checkouts from "#db/checkout/checkouts/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});
afterAll(async () => { await pool.end(); });

const session = async (c: PoolClient, user_id: string, direction: Direction) => {
  const created = await checkouts.create({ user_id, direction }, c);
  assert.ok(created, "the session was not created");
  return created!;
};

test("there is one session per user per direction", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = (await aUser(c)).id;
    const purchase = await session(c, user, "purchase");
    const sale = await session(c, user, "sale");
    assert.notEqual(purchase.id, sale.id, "the two directions shared a row");

    assert.equal(await checkouts.create({ user_id: user, direction: "purchase" }, c), undefined);
    assert.equal((await checkouts.findFor(user, "purchase", c))?.id, purchase.id);
    assert.ok((await checkouts.listFor(user, c)).length >= 2);
  });
});

test("update writes the named columns, leaves the rest, and answers the row", async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = (await aUser(c)).id;
    const row = await session(c, customer, "purchase");
    const first = await anAddress(c, { id: customer });
    const second = await anAddress(c, { id: customer }, { default_shipping: false });
    await checkouts.update(
      row.id, { recipient_address_id: first.id, payment_method_id: null }, c
    );

    const written = await checkouts.update(row.id, { recipient_address_id: second.id }, c);
    assert.equal(written?.recipient_address_id, second.id);
    assert.equal(written?.payment_method_id, null, "an absent key overwrote a column");
    assert.deepEqual(written, await checkouts.getOne(row.id, c));
  });
});

test("an explicit null clears a column - the reset a placed order performs", async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = (await aUser(c)).id;
    const row = await session(c, customer, "purchase");
    const address = await anAddress(c, { id: customer });
    await checkouts.update(row.id, { recipient_address_id: address.id }, c);

    const cleared = Object.fromEntries(checkouts.PATCHABLE.map((col) => [col, null]));
    const after = await checkouts.update(row.id, cleared, c);
    assert.equal(after?.recipient_address_id, null);
    assert.equal(after?.fulfillment_id, null);
    assert.equal(after?.payment_details_id, null);
  });
});

test("update answers undefined for an id with no session", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(
      await checkouts.update(randomUUID(), { payment_method_id: null }, c), undefined
    );
  });
});

test("remove answers true once and false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await session(c, (await aUser(c)).id, "sale");
    assert.equal(await checkouts.remove(row.id, c), true);
    assert.equal(await checkouts.remove(row.id, c), false);
  });
});

test("an address id from somebody else's book cannot land on a checkout", async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = (await aUser(c)).id;
    const stranger = await aUser(c);
    const theirs = await anAddress(c, stranger);
    const row = await session(c, mine, "purchase");

    await assert.rejects(
      () => checkouts.update(row.id, { recipient_address_id: theirs.id }, c),
      /violates foreign key constraint/i,
      "somebody else's address id was written to a checkout"
    );
  });
});

test("deleting the book entry clears the checkout's column, and only that column", async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = (await aUser(c)).id;
    const address = await anAddress(c, { id: customer });
    const row = await session(c, customer, "purchase");
    await checkouts.update(row.id, { recipient_address_id: address.id }, c);

    await userAddresses.remove(address.id, customer, c);

    const after = await checkouts.getOne(row.id, c);
    assert.equal(after?.recipient_address_id, null, "ON DELETE SET NULL did not fire");
    assert.equal(after?.user_id, customer, "the composite key nulled the OWNER as well");
    assert.equal(after?.direction, "purchase", "an unrelated column was cleared");
  });
});
