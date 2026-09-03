// D98: THE LEDGER TAKES {op, amount} AND APPLIES IT AS A DELTA, IN A
// TRANSACTION, UNDER A ROW LOCK.
//
// UsersDrawer computed `(user.dorado_funds ?? 0) +/- amount` in the BROWSER and
// PUT the absolute result as `mode: 'edit'`. Two problems, on a ledger holding
// $66,999.32 across 8 customers:
//
//   1. It violates ruling 10 - ids in, data out. The server should be told what
//      to DO, not what the answer is.
//   2. A LOST UPDATE. Two admins with the drawer open both compute from the
//      same stale balance; the second write silently discards the first, and
//      neither sees an error.
//
// The delta statement was always there - `COALESCE(dorado_funds, 0) + $1` - so
// what these pin is the half that was missing: that `op` is accepted, that the
// server refuses to drive a balance below zero (a check that lived ONLY in the
// browser), and that the adjustment reports the balance it produced instead of
// the caller computing it.
//
// THE LEDGER ROW EACH ADJUSTMENT NOW WRITES IS PINNED NEXT DOOR, in
// credit-ledger.test.ts, and deliberately not here: this file COMMITS and puts
// the balance back afterwards, and a payments.ledger row cannot be "put back" -
// it is an append-only record. Those assertions run inside a pinned
// transaction that rolls back instead.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as usersService from "#domain/users/service.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { outside } from "#shared/testing/pinned-pool.ts";

// THE STRUCTURAL SUBSET THE FIXTURE QUERY ASKS FOR.
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

// THIS FILE COMMITS, AND THEN PUTS THE BALANCE BACK.
//
// The concurrency test below needs two genuinely separate connections racing
// each other, which a pinned single-connection transaction cannot provide -
// pinning would hand both calls the same client and serialise the thing being
// measured. So every test here restores the balance it moved and the last one
// checks from outside that it did.
//
// WHAT IT DOES NOT PUT BACK, said plainly: the payments.ledger rows each
// adjustment now writes. A ledger row is an append-only record of a movement,
// and "restoring" one would mean deleting rows from a money table to keep a
// test tidy - which is a worse habit than a few rows on the test database. The
// balance assertions below are what this file is for; the ledger's own
// behaviour is pinned in credit-ledger.test.ts, inside a transaction that rolls
// back.
before(async () => {
  // THE BALANCE LOCK, HELD FOR THE WHOLE FILE - and a SESSION lock, not the
  // transaction-scoped one every other balance file uses. takeLocks() cannot be
  // used here: it takes pg_advisory_xact_lock, and THIS FILE HAS NO
  // TRANSACTIONS of its own - every adjustment commits. A session lock contends
  // in the same lock space, so it serialises correctly against every file that
  // takes USERS the ordinary way.
  //
  // IT BECAME NECESSARY WHEN THE ADJUSTMENT STARTED LEDGERING. This file
  // commits real payments.ledger rows for its fixture customer, and
  // credit-ledger.test.ts counts that customer's rows before and after its own
  // adjustment - so without the lock the two files raced and the count was off
  // by however many rows this one had committed in between.
  lockHolder = await pool.connect();
  await lockHolder.query("SELECT pg_advisory_lock($1)", [LOCKS.USERS]);

  // A customer who HAS a balance: against zero, "set to 0" and "left alone"
  // are indistinguishable. Dev's largest is 10.23, so the amounts below are
  // sized to that rather than to a round number - the subtraction tests derive
  // from the balance they read and never assume headroom.
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

after(async () => {
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
  // AND THE SERVER SAYS WHAT THE BALANCE BECAME. The drawer displayed a number
  // it had computed itself; this is the number to display instead.
  assert.equal(Number(await funds(customer.id)).toFixed(6), (before_ + 25).toFixed(6));
  await restore();
});

// `mode` WAS THE OTHER SPELLING AND IT IS GONE. It survived D98 only so the
// frontend could be re-pointed on its own schedule; shapes are no longer being
// preserved on this branch, so the old spelling is refused like any other
// unknown operation rather than quietly accepted.
test("the retired `mode` spelling is refused rather than silently honoured", async () => {
  const before_ = await funds(customer.id);
  await assert.rejects(
    // @ts-expect-error - `mode` is no longer a field; that is the point
    () => usersService.adjustDoradoCredit({ user_id: customer.id, mode: "add", amount: 10 }),
    (err: unknown) => {
      const e = err as { statusCode?: number; message?: string };
      assert.equal(e.statusCode, 400);
      assert.match(String(e.message), /unknown credit mode/);
      return true;
    }
  );
  assert.equal(Number(await funds(customer.id)).toFixed(6), before_.toFixed(6));
});

// TWO SEQUENTIAL DELTAS BOTH LAND. This is the property the browser's
// read-compute-PUT destroyed: with absolute totals, the second call overwrites
// the first because both were computed from the same starting balance.
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

// THE FLOOR WAS ONLY EVER CHECKED IN THE BROWSER. UsersDrawer refuses to submit
// a subtraction that would go negative; nothing on the server did, and
// dorado_funds is NOT NULL with no CHECK, so the database would have taken it.
test("the server refuses to drive a balance below zero", async () => {
  const before_ = await funds(customer.id);
  await assert.rejects(
    () => usersService.adjustDoradoCredit({
      user_id: customer.id, op: "subtract", amount: before_ + 1,
    }),
    (err: unknown) => {
      const e = err as { statusCode?: number; message?: string; code?: string };
      assert.equal(e.statusCode, 422);
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
      const e = err as { statusCode?: number; message?: string; code?: string };
      assert.equal(e.statusCode, 422);
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

test("an unknown op is refused with the same 400 an unknown mode always got", async () => {
  await assert.rejects(
    () => usersService.adjustDoradoCredit({ user_id: customer.id, op: "increment", amount: 1 }),
    (err: unknown) => {
      const e = err as { statusCode?: number; message?: string; code?: string };
      assert.equal(e.statusCode, 400);
      assert.match(String(e.message), /unknown credit mode/);
      return true;
    }
  );
});

test("nothing this file moved survived it", async () => {
  assert.equal(
    Number(await funds(customer.id)).toFixed(6),
    startingBalance.toFixed(6),
    "a credit adjustment was left committed"
  );
});
