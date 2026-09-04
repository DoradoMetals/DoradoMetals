// checkout.checkouts, against real Postgres, every test rolled back.
//
// Device-sync, not a ledger: what is checked is that the session WORKS - one
// row per (user_id, direction), a partial write that leaves the rest alone,
// and a clear that really clears.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
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

// THE CUSTOMER IS BUILT, SO THE SESSION IS ALWAYS NEW (lane 1). This used to
// read a real person out of the frozen exchange.users table and then say "dev
// already holds sessions for its users, so a test must not assume it is
// creating one" - true, and the reason `session` had a found-or-create branch
// that no assertion here ever wanted. A built customer has no sessions at all,
// so `create` is the only path and the two directions are genuinely two new
// rows.
const session = async (c: PoolClient, user_id: string, direction: string) => {
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

    // The second create loses the race by design and answers nothing.
    assert.equal(await checkouts.create({ user_id: user, direction: "purchase" }, c), undefined);
    assert.equal((await checkouts.findFor(user, "purchase", c))?.id, purchase.id);
    assert.ok((await checkouts.listFor(user, c)).length >= 2);
  });
});

test("update writes the named columns, leaves the rest, and answers the row", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await session(c, (await aUser(c)).id, "purchase");
    await checkouts.update(row.id, { pickup_date: "2026-09-04", pickup_time: "10:30:00" }, c);

    // RETURNING answers the fresh row, which is why no caller re-reads it.
    const written = await checkouts.update(row.id, { pickup_date: "2026-09-05" }, c);
    assert.equal(written?.pickup_date, "2026-09-05");
    assert.equal(written?.pickup_time, "10:30:00", "an absent key overwrote a column");
    assert.deepEqual(written, await checkouts.getOne(row.id, c));
  });
});

test("an explicit null clears a column - the reset a placed order performs", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await session(c, (await aUser(c)).id, "purchase");
    await checkouts.update(row.id, { pickup_date: "2026-09-04" }, c);

    const cleared = Object.fromEntries(checkouts.PATCHABLE.map((col) => [col, null]));
    const after = await checkouts.update(row.id, cleared, c);
    assert.equal(after?.pickup_date, null);
    assert.equal(after?.fulfillment_id, null);
    assert.equal(after?.payment_details_id, null);
  });
});

test("update answers undefined for an id with no session", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(
      await checkouts.update(randomUUID(), { pickup_date: "2026-09-04" }, c), undefined
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

// ------------------------------------------------- the address is the owner's
//
// Migration 123 replaced domain/checkout/service.ts's ADDRESS_COLUMNS loop -
// three column names in an array and a book lookup per patch - with composite
// foreign keys onto places.user_addresses (user_id, address_id). These pin what
// the schema now promises, because the promise is only as good as the
// constraint: the loop used to be the guarantee and the FK is now.

test("an address id from somebody else's book cannot land on a checkout", async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = (await aUser(c)).id;
    const stranger = await aUser(c);
    const theirs = await anAddress(c, stranger);
    const row = await session(c, mine, "purchase");

    await assert.rejects(
      () => checkouts.update(row.id, { shipper_address_id: theirs.id }, c),
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
    await checkouts.update(
      row.id, { shipper_address_id: address.id, pickup_date: "2026-09-04" }, c
    );

    // What domain/places/addresses/service.ts `remove` does first: the LINK
    // goes, and the address row itself only follows if nothing else needs it.
    await userAddresses.remove(address.id, customer, c);

    const after = await checkouts.getOne(row.id, c);
    assert.equal(after?.shipper_address_id, null, "ON DELETE SET NULL did not fire");
    assert.equal(after?.user_id, customer, "the composite key nulled the OWNER as well");
    assert.equal(after?.pickup_date, "2026-09-04", "an unrelated column was cleared");
  });
});
