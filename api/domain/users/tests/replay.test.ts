// The users endpoints, over real HTTP.
//
// Every route here is requireAdmin, and one of them moves money: /update_credit
// adjusts dorado_funds, a customer's store credit. Eight customers hold a
// balance and exchange.account_transactions is a $66,999.32 ledger, so this is
// the smallest endpoint in the API with the largest consequence.
//
// WHAT THIS SUITE FOUND. adjustUserCredit builds the new balance with a CASE
// that has no ELSE, and `mode` came from req.body unvalidated. A CASE matching
// nothing yields NULL, so an unrecognised mode assigned NULL to the balance.
//
// It never lost anyone's money, and the reason is the point: exchange.users.
// dorado_funds is NOT NULL, so the DATABASE refused the write and the caller
// got a 500. The code was not doing this job. auth.users.dorado_funds - where
// the write goes after promotion - was nullable with no default, so the
// protection was a property of the schema being left behind.
//
// Both halves are fixed: the service takes an allowlist of modes (080's
// companion), and migration 080 gives auth.users the same NOT NULL DEFAULT 0
// exchange has always had. This suite is what keeps them true.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back. The last test checks the balance from
// outside.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

// EVERY PINNED TRANSACTION IN THIS FILE TAKES THE BALANCE LOCK. A balance write
// is two row locks - exchange.users, and auth.users through migration 107's
// mirror trigger - so files that move balances agree an order rather than
// deadlocking on whichever customer each visited first. See LOCKS.USERS.
const inPinned = <T,>(fn: (c: import("pg").PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { lock: LOCKS.USERS });


await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. SELECT projections, not
// table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type CustomerFixture = UserFixture & { dorado_funds: number | null };

let admin: UserFixture;
let customer: CustomerFixture;
let balanceBefore: number | null;

// MONEY IS NOT COMPARED WITH FLOAT ARITHMETIC.
//
// dorado_funds is NUMERIC, and Postgres does exact decimal arithmetic on it.
// JavaScript does not: 10.23 + 25 evaluates to 35.230000000000004, while the
// database returns 35.23. The first version of this file asserted the JS sum
// against the database's answer and failed - correctly, because the database
// was right and the assertion was wrong.
//
// Comparing at 6 decimal places is far finer than money needs and far coarser
// than float error, so it distinguishes a real discrepancy from a
// representation one.
const sameMoney = (actual: unknown, expected: unknown, message: string) =>
  assert.equal(
    Number(actual).toFixed(6),
    Number(expected).toFixed(6),
    `${message} (got ${actual}, wanted ${expected})`
  );

const funds = async (id: string): Promise<number | null> => {
  const rows = await outside<{ dorado_funds: number | null }>(
    `SELECT dorado_funds FROM exchange.users WHERE id = $1`, [id]);
  return rows[0]?.dorado_funds ?? null;
};

before(async () => {
  const admins = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = admins[0];
  assert.ok(admin, "dev has no admin user");

  // Deliberately a customer who HAS a balance: an adjustment against a zero
  // balance cannot tell "set to 0" apart from "left alone".
  const users = await outside<CustomerFixture>(
    `SELECT id, name, email, dorado_funds FROM exchange.users
     WHERE role IS DISTINCT FROM 'admin' AND dorado_funds > 0 LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user with credit - the adjustment tests are vacuous");
  balanceBefore = await funds(customer.id);
  assert.ok(Number(balanceBefore) > 0, "the fixture customer has no balance to move");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("every route refuses an anonymous caller", async () => {
  await inPinned(async () => {
    await anonymous(async () => {
      const calls = [
        ["get_user", request(app).get("/api/users/get_user").query({ user_id: customer.id })],
        ["get_all_users", request(app).get("/api/users/get_all_users")],
        ["get_admin_users", request(app).get("/api/users/get_admin_users")],
        [
          "update_credit",
          request(app)
            .post("/api/users/update_credit")
            .send({ user_id: customer.id, mode: "add", amount: 1 }),
        ],
      ];
      // Declared as a tuple list: inferred, the element type collapses to
      // `string | Promise<Response>` and neither half is usable.
      for (const [name, call] of calls as Array<[string, Promise<{ status: number }>]>) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`);
      }
    });
  });
});

// The guard is requireAdmin, not requireUser. A signed-in customer adjusting
// their OWN credit is the exact attack this stops, so that is what is sent -
// not a stranger's id, which would also be caught by an ownership check that
// does not exist here.
test("a signed-in customer cannot top up their own balance", async () => {
  await inPinned(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, mode: "add", amount: 1000 });
      assert.ok([401, 403].includes(res.status), `a customer got ${res.status} adjusting credit`);
    });
  });
});

test("an admin reads the user list with balances", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).get("/api/users/get_all_users");
      assert.equal(res.status, 200);
      assert.ok(res.body.length > 0, "dev has users and none came back");
      assert.ok("dorado_funds" in res.body[0], "the admin list lost the balance column");
    });
  });
});

// get_user is the single-row read, and it deliberately does NOT carry
// dorado_funds. Recorded so a future change to the shared field list is visible.
test("the single-user read carries no balance, unlike the list", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).get("/api/users/get_user").query({ user_id: customer.id });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, customer.id);
      assert.ok(!("dorado_funds" in res.body), "get_user started returning the balance");
    });
  });
});

test("the admin list is only admins, and the full list is more than that", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const admins = await request(app).get("/api/users/get_admin_users");
      assert.equal(admins.status, 200);
      assert.ok(admins.body.length > 0, "no admin came back from get_admin_users");
      assert.deepEqual(
        admins.body.filter((u: { id: string; role: string }) => u.role !== "admin"),
        [],
        "get_admin_users returned a non-admin"
      );

      const all = await request(app).get("/api/users/get_all_users");
      assert.ok(
        all.body.length > admins.body.length,
        "every user is an admin, so this comparison proves nothing"
      );
    });
  });
});

test("the three modes each move the balance the way they say", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const read = async () => {
        const res = await request(app).get("/api/users/get_all_users");
        // GUARDED: this dereferenced find() straight through, so a customer
        // missing from the list produced a TypeError instead of saying so -
        // on the read that measures a credit balance.
        const row = res.body.find((u: { id: string; dorado_funds: unknown }) => u.id === customer.id);
        assert.ok(row, `customer ${customer.id} is absent from get_all_users`);
        return Number(row.dorado_funds);
      };

      const start = await read();

      let res = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, mode: "add", amount: 25 });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      sameMoney(await read(), start + 25, "add did not add");

      res = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, mode: "subtract", amount: 10 });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      sameMoney(await read(), start + 15, "subtract did not subtract");

      res = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, mode: "edit", amount: 7.5 });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      sameMoney(await read(), 7.5, "edit did not set the balance outright");
    });
  });
});

// THE ASSERTION THIS FILE EXISTS FOR.
//
// An unrecognised mode must be refused as a 400 BEFORE any UPDATE runs, and the
// balance must be exactly what it was. Asserting the status alone would not
// distinguish "refused" from "wrote NULL and then failed", which is what used
// to happen - the 500 came from the constraint, after the attempt.
test("an unrecognised mode is refused and the balance is untouched", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const read = async () => {
        const res = await request(app).get("/api/users/get_all_users");
        // GUARDED: this dereferenced find() straight through, so a customer
        // missing from the list produced a TypeError instead of saying so -
        // on the read that measures a credit balance.
        const row = res.body.find((u: { id: string; dorado_funds: unknown }) => u.id === customer.id);
        assert.ok(row, `customer ${customer.id} is absent from get_all_users`);
        return row.dorado_funds;
      };
      const start = await read();

      for (const mode of ["ADD", "Add", "increment", "", null, undefined, "delete"]) {
        const res = await request(app)
          .post("/api/users/update_credit")
          .send({ user_id: customer.id, mode, amount: 50 });
        assert.equal(
          res.status,
          400,
          `mode ${JSON.stringify(mode)} answered ${res.status}, not 400`
        );
        sameMoney(
          await read(),
          start,
          `mode ${JSON.stringify(mode)} changed the balance before being refused`
        );
      }
    });
  });
});

// Number("") and Number(null) are both 0, so an empty amount field under `edit`
// would have zeroed a customer's balance and returned 200.
test("an amount that is not a number is refused rather than treated as zero", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      // Each of these coerces to a finite 0 through Number(), or would have:
      // "" -> 0, null -> 0, [] -> 0. Under `edit` that is a zeroed balance.
      for (const amount of ["", null, undefined, "abc", {}, [], NaN, "  "]) {
        const res = await request(app)
          .post("/api/users/update_credit")
          .send({ user_id: customer.id, mode: "edit", amount });
        assert.equal(
          res.status,
          400,
          `amount ${JSON.stringify(amount)} answered ${res.status}, not 400`
        );
      }
    });
  });
});

// The property the pin exists for, and the one that matters most here: every
// test above moved a real customer's credit balance and read it back through
// the API. This checks the database outside the transaction.
test("no balance this file moved survived the transaction", async () => {
  assert.equal(
    String(await funds(customer.id)),
    String(balanceBefore),
    "a credit adjustment was committed to dev"
  );
});
