// The users endpoints, over real HTTP. /update_credit moves money - dorado_funds is a $66,999.32 ledger across eight customers - the smallest endpoint with the largest consequence.
// The CASE-with-no-ELSE hazard: an unrecognised mode used to assign NULL to the balance. Now double-guarded - the service allowlists modes, and both exchange.users and auth.users are NOT NULL DEFAULT 0.
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query; the last test checks the balance from outside.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

// Every pinned transaction here takes the balance lock: a balance write is two row locks (exchange.users, and auth.users via the mirror trigger), so files that move balances must agree an order.
const inPinned = <T,>(fn: (c: import("pg").PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { lock: LOCKS.USERS });


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

  // Deliberately a customer who HAS a balance: against zero, "set to 0" and "left alone" are indistinguishable.
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

// get_user deliberately does NOT carry dorado_funds - recorded so a future change to the shared field list is visible.
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
        // GUARDED: an unguarded find() would TypeError on a missing customer instead of saying so.
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

// The assertion this file exists for: an unrecognised mode must be refused BEFORE any UPDATE runs. Asserting the status alone wouldn't distinguish "refused" from "wrote NULL and then failed" (the old 500 came from the constraint, after the attempt).
test("an unrecognised mode is refused and the balance is untouched", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const read = async () => {
        const res = await request(app).get("/api/users/get_all_users");
        // GUARDED: an unguarded find() would TypeError on a missing customer instead of saying so.
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

// Number("") and Number(null) are both 0, so an empty amount field under `edit` would have zeroed a customer's balance and returned 200.
test("an amount that is not a number is refused rather than treated as zero", async () => {
  await inPinned(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      // Each of these coerces to a finite 0 through Number(): "" -> 0, null -> 0, [] -> 0.
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

// The property the pin exists for: every test above moved a real customer's credit balance through the API - this checks the database outside the transaction.
test("no balance this file moved survived the transaction", async () => {
  assert.equal(
    String(await funds(customer.id)),
    String(balanceBefore),
    "a credit adjustment was committed to dev"
  );
});
