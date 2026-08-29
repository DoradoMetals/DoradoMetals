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
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import * as usersService from "#features/users/service.ts";
import { outside } from "#shared/testing/pinned-pool.ts";

let customer;
let startingBalance;

const funds = async (id) => {
  const rows = await outside(`SELECT dorado_funds FROM exchange.users WHERE id = $1`, [id]);
  return Number(rows[0]?.dorado_funds);
};

// THIS FILE COMMITS, AND THEN PUTS IT BACK.
//
// adjustDoradoCredit opens its own transaction on its own connection - it has
// to, because the row lock is the point - so a pinned test transaction cannot
// contain it. Rather than pretend otherwise, every test here restores the
// balance it moved and the last one checks from outside that it did. That is
// the honest shape for a write whose whole subject is transactional behaviour;
// audit:test-leaks is what would catch it if the restore stopped working.
before(async () => {
  // A customer who HAS a balance: against zero, "set to 0" and "left alone"
  // are indistinguishable. Dev's largest is 10.23, so the amounts below are
  // sized to that rather than to a round number - the subtraction tests derive
  // from the balance they read and never assume headroom.
  const rows = await outside(
    `SELECT id FROM exchange.users
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

after(restore);

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

test("`mode` still works, so the frontend can be re-pointed separately", async () => {
  const before_ = await funds(customer.id);
  await usersService.adjustDoradoCredit({ user_id: customer.id, mode: "add", amount: 10 });
  assert.equal(Number(await funds(customer.id)).toFixed(6), (before_ + 10).toFixed(6));
  await restore();
});

test("`op` wins when both spellings arrive", async () => {
  const before_ = await funds(customer.id);
  await usersService.adjustDoradoCredit({
    user_id: customer.id, op: "add", mode: "subtract", amount: 5,
  });
  assert.equal(Number(await funds(customer.id)).toFixed(6), (before_ + 5).toFixed(6));
  await restore();
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
    (err) => {
      assert.equal(err.statusCode, 422);
      assert.match(err.message, /cannot go below zero/);
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
    (err) => {
      assert.equal(err.statusCode, 422);
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
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /unknown credit mode/);
      return true;
    }
  );
});

test("nothing this file moved survived it", async () => {
  assert.equal(
    Number(await funds(customer.id)).toFixed(6),
    startingBalance.toFixed(6),
    "a credit adjustment was left committed to dev"
  );
});
