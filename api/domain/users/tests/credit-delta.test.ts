// D98: THE LEDGER TAKES {op, amount} AND APPLIES IT AS A DELTA, IN A
// TRANSACTION, UNDER A ROW LOCK - not an absolute total the browser computed
// and PUT, which let two admins on a $66,999.32 ledger silently discard each
// other's write.
//
// THE LEDGER ROW EACH ADJUSTMENT NOW WRITES IS PINNED NEXT DOOR, in
// credit-ledger.test.ts, and deliberately not here: this file COMMITS and
// puts the balance back afterwards, and a payments.ledger row cannot be "put
// back" - it is an append-only record.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as usersService from "#domain/users/service.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { outside } from "#shared/testing/pinned-pool.ts";

// The structural subset the fixture query asks for.
type UserFixture = { id: string };

let customer: UserFixture;
let startingBalance: number;
let lockHolder: PoolClient;

// auth.users, WHICH IS WHERE THE WRITE LANDS SINCE MIGRATION 118. It was
// exchange.users while a trigger mirrored the balance across; reading the
// written table rather than a copy of it is what makes these assertions mean
// anything.
const funds = async (id: string) => {
  const rows = await outside<{ dorado_funds: number | null }>(
    `SELECT dorado_funds FROM auth.users WHERE id = $1`, [id]);
  return Number(rows[0]?.dorado_funds);
};

// THIS FILE COMMITS, AND THEN PUTS THE BALANCE BACK: adjustDoradoCredit opens
// its own transaction (the row lock is the point), so a pinned test
// transaction can't contain it.
//
// WHAT IT DOES NOT PUT BACK: the payments.ledger rows each adjustment now
// writes - an append-only record. The ledger's own behaviour is pinned in
// credit-ledger.test.ts, inside a transaction that rolls back.
beforeAll(async () => {
  // THE BALANCE LOCK, HELD FOR THE WHOLE FILE - a SESSION lock, not the
  // transaction-scoped one every other balance file uses: this file has no
  // transactions of its own, and credit-ledger.test.ts counts this same
  // customer's ledger rows, so without it the two files race.
  lockHolder = await pool.connect();
  await lockHolder.query("SELECT pg_advisory_lock($1)", [LOCKS.USERS]);

  // A customer who HAS a balance: against zero, "set to 0" and "left alone"
  // are indistinguishable.
  const rows = await outside<UserFixture>(
    `SELECT id FROM auth.users
      WHERE role IS DISTINCT FROM 'admin' AND dorado_funds > 0
      ORDER BY dorado_funds DESC LIMIT 1`
  );
  customer = rows[0];
  assert.ok(customer, "dev has no customer with credit - these tests would be vacuous");
  startingBalance = await funds(customer.id);
  assert.ok(startingBalance > 0, "the fixture customer has no balance to move");
});

const restore = async () => {
  await usersService.adjustDoradoCredit({
    user_id: customer.id, op: "edit", amount: startingBalance,
  });
};

afterAll(async () => {
  await restore();
  await lockHolder.query("SELECT pg_advisory_unlock($1)", [LOCKS.USERS]);
  lockHolder.release();
  await pool.end();
});

test("`op` is the spelling, and it adds a DELTA rather than setting a total", async () => {
  const before_ = await funds(customer.id);
  const res = await usersService.adjustDoradoCredit({
    user_id: customer.id, op: "add", amount: 25,
  });
  assert.equal(Number(res.dorado_funds).toFixed(6), (before_ + 25).toFixed(6));
  // The server says what the balance became, rather than the caller computing it.
  assert.equal(Number(await funds(customer.id)).toFixed(6), (before_ + 25).toFixed(6));
  await restore();
});

// Two sequential deltas both land - the property absolute totals destroyed, since both would be computed from the same starting balance.
test("two adjustments in a row both apply, which absolute totals could not guarantee", async () => {
  const before_ = await funds(customer.id);
  await Promise.all([
    usersService.adjustDoradoCredit({ user_id: customer.id, op: "add", amount: 30 }),
    usersService.adjustDoradoCredit({ user_id: customer.id, op: "add", amount: 40 }),
  ]);
  assert.equal(
    Number(await funds(customer.id)).toFixed(6),
    (before_ + 70).toFixed(6),
    "one of two concurrent credits was lost - the delta is not atomic"
  );
  await restore();
});

// The floor used to be checked only in the browser - the column has no CHECK constraint, so the database would have taken a negative balance.
test("the server refuses to drive a balance below zero", async () => {
  const before_ = await funds(customer.id);
  await assert.rejects(
    () => usersService.adjustDoradoCredit({
      user_id: customer.id, op: "subtract", amount: before_ + 1,
    }),
    (err: unknown) => {
      const e = err as { kind?: string; message?: string };
      assert.equal(e.kind, "invalid");
      assert.match(String(e.message), /cannot go below zero/);
      return true;
    }
  );
  assert.equal(
    Number(await funds(customer.id)).toFixed(6),
    before_.toFixed(6),
    "the balance moved before being refused"
  );
});

test("a negative `edit` is refused too", async () => {
  const before_ = await funds(customer.id);
  await assert.rejects(
    () => usersService.adjustDoradoCredit({ user_id: customer.id, op: "edit", amount: -1 }),
    (err: unknown) => {
      const e = err as { kind?: string };
      assert.equal(e.kind, "invalid");
      return true;
    }
  );
  assert.equal(Number(await funds(customer.id)).toFixed(6), before_.toFixed(6));
});

// Exactly zero is a legitimate balance and must not be caught by the floor.
test("subtracting the whole balance is allowed, and lands on zero", async () => {
  const before_ = await funds(customer.id);
  const res = await usersService.adjustDoradoCredit({
    user_id: customer.id, op: "subtract", amount: before_,
  });
  assert.equal(Number(res.dorado_funds), 0);
  await restore();
});

// THIS FILE COMMITS, so it must put every balance back. The one thing it
// cannot put back is a payments.ledger row, whose behaviour is pinned in
// credit-ledger.test.ts inside a transaction that rolls back.
test("nothing this file moved survived it", async () => {
  assert.equal(
    Number(await funds(customer.id)).toFixed(6),
    startingBalance.toFixed(6),
    "a credit adjustment was left committed"
  );
});
