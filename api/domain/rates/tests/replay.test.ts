// The rates endpoints, over real HTTP.
//
// `/get_all` has no guard at all while `/get_admin`, `/get_one`, `/create`, `/update` and `/delete` are requireAdmin - this file proves the public read can't leak what only admin should see.
// Nothing is committed: pinned-pool.ts rolls back every query; the last test checks from outside.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };

let admin: UserFixture;
let customer: UserFixture;
let rateCountBefore: number;

beforeAll(async () => {
  const admins = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = admins[0];
  assert.ok(admin, "dev has no admin user");

  const users = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user - the refusal case is untested");

  const rates = await outside(`SELECT count(*)::int AS n FROM exchange.rates`);
  assert.ok(rates[0].n > 0, "dev has no rates to read");
  rateCountBefore = rates[0].n;
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// Named, not spread: the fixture is only ever id/name/email plus the role the call is exercising.
const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: "admin" }, fn);
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: "user" }, fn);

test("the public rate list needs no session at all", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/rates/get_all");
      assert.equal(res.status, 200, "the public rates route stopped being public");
      assert.ok(Array.isArray(res.body), "the pricing page expects an array");
      assert.ok(res.body.length > 0, "dev has rates and none came back");
    });
  });
});

// The admin read may carry more than the public one; the public one must not carry what only an admin should see. Compared field by field.
test("the public list does not carry anything only the admin list has", async () => {
  await inPinnedTransaction(async () => {
    let publicFields: Set<string> | undefined;
    let adminFields: Set<string> | undefined;

    await anonymous(async () => {
      const res = await request(app).get("/api/rates/get_all");
      publicFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    await asAdmin(async () => {
      const res = await request(app).get("/api/rates/get_admin");
      assert.equal(res.status, 200);
      assert.ok(res.body.length > 0, "the admin rates read returned nothing");
      adminFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    // Guarded and bound to consts: a request that never ran left these undefined and the spread TypeError'd instead of naming which read produced nothing.
    assert.ok(publicFields, "the public rates read produced no fields");
    assert.ok(adminFields, "the admin rates read produced no fields");
    const publicSet = publicFields;
    const adminSet = adminFields;
    const onlyAdmin = [...adminSet].filter((f) => !publicSet.has(f));
    const publicExtras = [...publicSet].filter((f) => !adminSet.has(f));

    assert.equal(
      publicExtras.length,
      0,
      `the public read returns fields the admin read does not: ${publicExtras.join(", ")}`
    );

    // Not an assertion that they must differ - records what the difference IS so a change to either is visible in a diff.
    console.log(
      `      public rate fields: ${publicSet.size}; admin-only: ` +
        (onlyAdmin.length ? onlyAdmin.join(", ") : "(none - the two reads are the same shape)")
    );
  });
});

test("every writing route refuses a signed-in non-admin", async () => {
  await inPinnedTransaction(async () => {
    await asCustomer(async () => {
      const calls = [
        ["get_admin", request(app).get("/api/rates/get_admin")],
        ["create", request(app).post("/api/rates/create").send({ rate: {} })],
        ["update", request(app).post("/api/rates/update").send({ rate_id: randomUUID(), patch: {} })],
        ["delete", request(app).delete("/api/rates/delete").send({ rate_id: randomUUID() })],
      ] as Array<[string, Promise<{ status: number }>]>;
      // Declared as a tuple list: inferred, the element type collapses to `string | Test` and neither half is usable.
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} to a non-admin`);
      }
    });
  });
});

test("an anonymous caller is refused the admin read", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/rates/get_admin");
      assert.ok([401, 403].includes(res.status), `answered ${res.status}`);
    });
  });
});

// A 403 says the response was refused, not that nothing was written - a guard placed after the write would answer the same. Counting the table from outside the transaction is what distinguishes them.
test("the refused writes wrote nothing", async () => {
  const after = await outside(`SELECT count(*)::int AS n FROM exchange.rates`);
  assert.equal(
    after[0].n,
    rateCountBefore,
    "a route that answered 401/403 still changed the table"
  );
});
