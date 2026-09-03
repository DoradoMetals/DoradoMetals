// The ledger takes {op, amount} and applies it as a delta, under a row lock - not an absolute total the browser computed and PUT, which let two admins on a $66,999.32 ledger silently discard each other's write.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import * as usersService from "#domain/users/service.ts";
import { outside } from "#shared/testing/pinned-pool.ts";

// The structural subset the fixture query asks for.
type UserFixture = { id: string };

let customer: UserFixture;
let startingBalance: number;

const funds = async (id: string) => {
  const rows = await outside<{ dorado_funds: number | null }>(
    `SELECT dorado_funds FROM exchange.users WHERE id = $1`, [id]);
  return Number(rows[0]?.dorado_funds);
};

// THIS FILE COMMITS, AND THEN PUTS IT BACK: adjustDoradoCredit opens its own transaction (the row lock is the point), so a pinned test transaction can't contain it. audit:test-leaks would catch it if the restore stopped working.
before(async () => {
  // A customer who HAS a balance: against zero, "set to 0" and "left alone" are indistinguishable.
  const rows = await outside<UserFixture>(
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
  // The server says what the balance became, rather than the caller computing it.
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
    "a credit adjustment was left committed to dev"
  );
});
