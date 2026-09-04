// The users endpoints, over real HTTP. /update_credit moves money -
// dorado_funds is a $66,999.32 ledger across eight customers - the smallest
// endpoint with the largest consequence.
// The CASE-with-no-ELSE hazard: an unrecognised mode used to assign NULL to
// the balance. Now double-guarded - the service allowlists modes, and
// auth.users.dorado_funds is NOT NULL DEFAULT 0.
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query; the last test
// checks the balance from outside.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import * as usersRepo from "#db/users/repo.ts";

// EVERY PINNED TRANSACTION IN THIS FILE TAKES THE BALANCE LOCK: an
// adjustment is a locked read on auth.users held across an insert into
// payments.ledger, so files that move balances must agree an order. See
// LOCKS.USERS.
const inPinned = <T,>(fn: (c: import("pg").PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });


await mockSessions();
const { default: app } = await import("#app");

// The structural subset each fixture actually has - SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type CustomerFixture = UserFixture & { dorado_funds: number | null };

let admin: UserFixture;
let customer: CustomerFixture;
let balanceBefore: number | null;

// Money is not compared with float arithmetic: dorado_funds is NUMERIC (exact), but JS gives 10.23 + 25 as 35.230000000000004 where the database returns 35.23. Compared at 6 decimal places - finer than money needs, coarser than float error.
const sameMoney = (actual: unknown, expected: unknown, message: string) =>
  assert.equal(
    Number(actual).toFixed(6),
    Number(expected).toFixed(6),
    `${message} (got ${actual}, wanted ${expected})`
  );

// LOCKED, even though this is a plain read. beforeAll/afterAll call this
// OUTSIDE any pinned transaction (the fixture and the closing check both have
// to see committed state, which is what `outside()` is for) - but that used
// to mean it raced credit-delta.test.ts, which committed real balance changes
// to this SAME customer for the whole life of its file. `pg_advisory_xact_lock`
// inside the same statement waits its turn behind LOCKS.USERS the way every
// other file that touches this row does, without holding a session-level lock
// past the single round trip `outside()` makes (the CTE's implicit
// transaction ends, and the lock releases, the moment this one statement
// finishes) - so nothing here can be caught mid-flight by another file's
// pinned transaction, or vice versa.
const funds = async (id: string): Promise<number | null> => {
  const rows = await outside<{ dorado_funds: number | null }>(
    `WITH lock AS (SELECT pg_advisory_xact_lock($2))
     SELECT dorado_funds FROM auth.users WHERE id = $1`, [id, LOCKS.USERS]);
  return rows[0]?.dorado_funds ?? null;
};

// THE TWO NAMED PEOPLE (lane 1). Both identities were discovered - the first
// admin, and the first non-admin who happened to hold credit - so every
// adjustment below moved a REAL customer's balance through the API, and the
// file's own closing test exists because of it. The people are named now and
// the customer starts at a KNOWN balance, given to them INSIDE each pinned
// transaction by `fund()`, so "set to 0" and "left alone" are still
// distinguishable without anybody's real money being involved.
const STARTING_BALANCE = 250;

beforeAll(async () => {
  admin = TEST_ACTOR;
  customer = { ...TEST_CUSTOMER, dorado_funds: STARTING_BALANCE };
  balanceBefore = await funds(customer.id);
});

// Inside the pin, so it rolls back with everything else.
const fund = async (client: import("pg").PoolClient) => {
  await usersRepo.adjustCredit(customer.id, "edit", STARTING_BALANCE, client);
};

afterAll(async () => {
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
            .send({ user_id: customer.id, op: "add", amount: 1 }),
        ],
      ];
      // Declared as a tuple list: inferred, the element type collapses to `string | Promise<Response>` and neither half is usable.
      for (const [name, call] of calls as Array<[string, Promise<{ status: number }>]>) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`);
      }
    });
  });
});

// The guard is requireAdmin, not requireUser - a signed-in customer adjusting their OWN credit is the exact attack this stops, not a stranger's id (which an ownership check that doesn't exist here would also catch).
test("a signed-in customer cannot top up their own balance", async () => {
  await inPinned(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, op: "add", amount: 1000 });
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

// get_user CARRIES THE BALANCE NOW, where it used to omit it while the list
// read carried it - the single-user read is the one an admin opens to adjust
// a balance, so it is the read most in need of one.
test("the single-user read carries the balance, like the list", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).get("/api/users/get_user").query({ user_id: customer.id });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, customer.id);
      assert.ok("dorado_funds" in res.body, "get_user stopped returning the balance");

      const list = await request(app).get("/api/users/get_all_users");
      const fromList = list.body.find((u: { id: string }) => u.id === customer.id);
      assert.equal(
        Number(res.body.dorado_funds), Number(fromList.dorado_funds),
        "the two reads disagree about one customer's balance"
      );
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

test("the three operations each move the balance the way they say", async () => {
  await inPinned(async (client) => {
    await fund(client);
    await as({ ...admin, role: "admin" }, async () => {
      const read = async () => {
        const res = await request(app).get("/api/users/get_all_users");
        // GUARDED: an unguarded find() would TypeError on a missing customer instead of saying so.
        const row = res.body.find((u: { id: string; dorado_funds: unknown }) => u.id === customer.id);
        assert.ok(row, `customer ${customer.id} is absent from get_all_users`);
        return Number(row.dorado_funds);
      };

      const start = await read();

      let res = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, op: "add", amount: 25 });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      sameMoney(await read(), start + 25, "add did not add");

      res = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, op: "subtract", amount: 10 });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      sameMoney(await read(), start + 15, "subtract did not subtract");

      res = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, op: "edit", amount: 7.5 });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      sameMoney(await read(), 7.5, "edit did not set the balance outright");
    });
  });
});

// THE ASSERTION THIS FILE EXISTS FOR: an unrecognised operation must be
// refused as a 400 BEFORE any UPDATE runs, and the balance must be exactly
// what it was - not "wrote NULL and then failed", which is what used to
// happen.
// "mode" IS IN THE LIST NOW: it was the field's old spelling, and a body
// still sending it names no operation at all, so it must be refused like any
// other unrecognised one.
test("an unrecognised operation is refused and the balance is untouched", async () => {
  await inPinned(async (client) => {
    await fund(client);
    await as({ ...admin, role: "admin" }, async () => {
      const read = async () => {
        const res = await request(app).get("/api/users/get_all_users");
        // GUARDED: an unguarded find() would TypeError on a missing customer instead of saying so.
        const row = res.body.find((u: { id: string; dorado_funds: unknown }) => u.id === customer.id);
        assert.ok(row, `customer ${customer.id} is absent from get_all_users`);
        return row.dorado_funds;
      };
      const start = await read();

      for (const op of ["ADD", "Add", "increment", "", null, undefined, "delete"]) {
        const res = await request(app)
          .post("/api/users/update_credit")
          .send({ user_id: customer.id, op, amount: 50 });
        assert.equal(
          res.status,
          400,
          `op ${JSON.stringify(op)} answered ${res.status}, not 400`
        );
        sameMoney(
          await read(),
          start,
          `op ${JSON.stringify(op)} changed the balance before being refused`
        );
      }

      // The retired spelling, sent the way the browser used to send it.
      const retired = await request(app)
        .post("/api/users/update_credit")
        .send({ user_id: customer.id, mode: "add", amount: 50 });
      assert.equal(retired.status, 400, "the retired `mode` spelling was honoured");
      sameMoney(await read(), start, "`mode` moved the balance");
    });
  });
});

// Number("") and Number(null) are both 0, so an empty amount field under `edit` would have zeroed a customer's balance and returned 200.
test("an amount that is not a number is refused rather than treated as zero", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      // Each of these coerces to a finite 0 through Number(): "" -> 0, null -> 0, [] -> 0.
      for (const amount of ["", null, undefined, "abc", {}, [], NaN, "  "]) {
        const res = await request(app)
          .post("/api/users/update_credit")
          .send({ user_id: customer.id, op: "edit", amount });
        assert.equal(
          res.status,
          400,
          `amount ${JSON.stringify(amount)} answered ${res.status}, not 400`
        );
      }
    });
  });
});

// The property the pin exists for: every test above moved a real customer's credit balance through the API - this checks the database outside the transaction.
test("no balance this file moved survived the transaction", async () => {
  assert.equal(
    String(await funds(customer.id)),
    String(balanceBefore),
    "a credit adjustment was committed to dev"
  );
});
