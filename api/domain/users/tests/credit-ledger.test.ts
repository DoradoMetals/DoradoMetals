// AN ADMIN CREDIT ADJUSTMENT IS A MOVEMENT, AND MOVEMENTS ARE LEDGERED.
//
// Every other way a balance moves already wrote a payments.ledger row at its
// call site, with the order id that explains it: a purchase order crediting its
// total, a sale reserving credit at placement, the abandonment sweep putting it
// back. The admin edit - the one an operator makes by hand, with no order
// behind it - wrote nothing at all, so the single class of movement with no
// paper trail was the one a human performed. That is what these pin.
//
// INSIDE A PINNED TRANSACTION, WHICH ROLLS BACK. credit-delta.test.ts commits
// and restores the balance it moved; that shape cannot work here, because a
// ledger row is an append-only record and "restoring" it would mean deleting
// rows from a money table on dev to make a test tidy. Pinning the pool lets
// adjustDoradoCredit open its own transaction as a savepoint and lose it on
// rollback, so nothing survives the file.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import * as usersService from "#domain/users/service.ts";
import query from "#shared/db/query.ts";

// The balance lock, like every other file that moves one - see LOCKS.USERS.
const inPinned = <T,>(fn: (c: PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { lock: LOCKS.USERS });

// A customer with a balance: against zero, "subtract" has nothing to work with
// and the floor check refuses before the ledger is ever reached.
async function aFundedCustomer(client: PoolClient) {
  const { rows } = await query<{ id: string; dorado_funds: number }>(
    `SELECT id, dorado_funds FROM auth.users
      WHERE role IS DISTINCT FROM 'admin' AND dorado_funds > 0
      ORDER BY dorado_funds DESC LIMIT 1`,
    [], client
  );
  assert.ok(rows.length, "dev has no customer with credit - these tests would be vacuous");
  return rows[0];
}

// THE ROWS THAT WERE NOT THERE BEFORE, FOUND BY ID RATHER THAN BY TIME.
//
// "the newest row" is the obvious way to write this and it does not work here.
// occurred_at and created_at both default to now(), which is the TRANSACTION's
// start time and constant within it - and inPinnedTransaction issues its BEGIN
// before waiting for the advisory lock, so a row written inside this
// transaction can carry a timestamp EARLIER than one another file committed
// while this one was queued. Ordering by time then returns the other file's
// row, and the test fails claiming a subtraction wrote a Credit.
async function ledgerIds(client: PoolClient, user_id: string): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM payments.ledger WHERE user_id = $1`, [user_id], client
  );
  return rows.map((r) => r.id);
}

async function rowsAdded(client: PoolClient, user_id: string, before: string[]) {
  const { rows } = await query<{ type: string; amount: number; order_id: string | null }>(
    `SELECT type, amount, order_id FROM payments.ledger
      WHERE user_id = $1 AND id <> ALL($2::uuid[])`,
    [user_id, before], client
  );
  return rows;
}

test("an admin credit writes one Credit row for exactly what moved", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    const before = await ledgerIds(client, customer.id);

    await usersService.adjustDoradoCredit({ user_id: customer.id, op: "add", amount: 12.5 });

    const added = await rowsAdded(client, customer.id, before);
    assert.equal(added.length, 1, "an adjustment wrote something other than one row");
    assert.equal(added[0].type, "Credit");
    assert.equal(Number(added[0].amount), 12.5);
    // No order explains an admin edit, and the row says so rather than guessing
    // one. order_id is a FK to orders.orders, so inventing a value would fail
    // loudly - which is the right failure, but the honest answer is null.
    assert.equal(added[0].order_id, null);
  });
});

test("a subtraction writes a Debit", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    const before = await ledgerIds(client, customer.id);

    await usersService.adjustDoradoCredit({ user_id: customer.id, op: "subtract", amount: 4.25 });

    const added = await rowsAdded(client, customer.id, before);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, "Debit");
    assert.equal(Number(added[0].amount), 4.25);
  });
});

// `edit` NAMES NO DIRECTION, and that is why the direction is read off the two
// balances rather than off the request. An edit downwards is a debit; an edit
// upwards is a credit; the same request field produces either.
test("an edit upwards is a Credit and an edit downwards is a Debit", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    // Normalised first, so the two edits below move a known amount rather than
    // whatever eighteen-decimal balance dev happens to hold.
    await usersService.adjustDoradoCredit({ user_id: customer.id, op: "edit", amount: 500 });

    let before = await ledgerIds(client, customer.id);
    await usersService.adjustDoradoCredit({ user_id: customer.id, op: "edit", amount: 600 });
    let added = await rowsAdded(client, customer.id, before);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, "Credit");
    assert.equal(Number(added[0].amount), 100);

    before = await ledgerIds(client, customer.id);
    await usersService.adjustDoradoCredit({ user_id: customer.id, op: "edit", amount: 500 });
    added = await rowsAdded(client, customer.id, before);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, "Debit");
    assert.equal(Number(added[0].amount), 100);
  });
});

// A no-op edit moves no money, so it is not a movement. payments.ledger's CHECK
// allows amount = 0, so a zero row would be stored happily and be
// indistinguishable from a real movement of nothing.
//
// THE BALANCE IS NORMALISED FIRST, and that is not incidental. Dev balances
// carry eighteen decimal places (numeric is exact; a JavaScript number is not),
// so "edit to the balance you already have" read out of the row and sent back
// through a float is NOT the same number - it is the same number to about six
// places, which the movement check correctly reports as a movement. Setting a
// clean value first makes the second edit a genuine no-op rather than a test of
// float round-tripping.
test("an edit that changes nothing writes no ledger row", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    await usersService.adjustDoradoCredit({ user_id: customer.id, op: "edit", amount: 100 });

    const before = await ledgerIds(client, customer.id);
    await usersService.adjustDoradoCredit({ user_id: customer.id, op: "edit", amount: 100 });
    assert.deepEqual(await rowsAdded(client, customer.id, before), []);
  });
});

// THE ROW AND THE MOVEMENT COMMIT TOGETHER OR NEITHER DOES. A refusal that left
// a ledger row behind would be a record of money that never moved, which is
// worse than no record at all.
test("a refused adjustment writes no ledger row and moves no balance", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    const before = await ledgerIds(client, customer.id);

    await assert.rejects(() => usersService.adjustDoradoCredit({
      user_id: customer.id, op: "subtract", amount: Number(customer.dorado_funds) + 1,
    }));

    assert.deepEqual(await rowsAdded(client, customer.id, before), []);
    const { rows } = await query<{ dorado_funds: number }>(
      `SELECT dorado_funds FROM auth.users WHERE id = $1`, [customer.id], client
    );
    assert.equal(Number(rows[0].dorado_funds), Number(customer.dorado_funds));
  });
});
