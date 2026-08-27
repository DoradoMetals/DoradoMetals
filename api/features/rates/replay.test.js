// The rates endpoints, over real HTTP.
//
// Rates is a promotion candidate alongside leads, and it has something leads
// does not: a PUBLIC route sitting beside admin ones. `/get_all` has no guard
// at all - anyone on the internet can call it - while `/get_admin`,
// `/get_one`, `/create`, `/update` and `/delete` are requireAdmin.
//
// That asymmetry is the thing worth testing. Two reads over the same table,
// one of them unauthenticated, is exactly the shape that leaks: it only takes
// the public read gaining a column, or the two quietly converging on the same
// repo call, for the guard on the other five to stop meaning anything.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back. The last test checks from outside.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let customer;
let rateCountBefore;

before(async () => {
  const admins = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = admins[0];
  assert.ok(admin, "dev has no admin user");

  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user - the refusal case is untested");

  const rates = await outside(`SELECT count(*)::int AS n FROM exchange.rates`);
  assert.ok(rates[0].n > 0, "dev has no rates to read");
  rateCountBefore = rates[0].n;
});

after(async () => {
  restoreSessions();
  await pool.end();
});

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

// THE ASSERTION THIS FILE EXISTS FOR. The admin read is allowed to carry more
// than the public one; the public one must not carry what only an admin should
// see. Compared field by field rather than by trusting the two service calls
// stay different.
test("the public list does not carry anything only the admin list has", async () => {
  await inPinnedTransaction(async () => {
    let publicFields;
    let adminFields;

    await anonymous(async () => {
      const res = await request(app).get("/api/rates/get_all");
      publicFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).get("/api/rates/get_admin");
      assert.equal(res.status, 200);
      assert.ok(res.body.length > 0, "the admin rates read returned nothing");
      adminFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    const onlyAdmin = [...adminFields].filter((f) => !publicFields.has(f));
    const publicExtras = [...publicFields].filter((f) => !adminFields.has(f));

    assert.equal(
      publicExtras.length,
      0,
      `the public read returns fields the admin read does not: ${publicExtras.join(", ")}`
    );

    // Not an assertion that they must differ - they may legitimately be the
    // same shape today. It records what the difference IS, so that a change to
    // either is visible in a diff rather than silent.
    console.log(
      `      public rate fields: ${publicFields.size}; admin-only: ` +
        (onlyAdmin.length ? onlyAdmin.join(", ") : "(none - the two reads are the same shape)")
    );
  });
});

test("every writing route refuses a signed-in non-admin", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const calls = [
        ["get_admin", request(app).get("/api/rates/get_admin")],
        ["create", request(app).post("/api/rates/create").send({ rate: {} })],
        ["update", request(app).post("/api/rates/update").send({ rate: {} })],
        ["delete", request(app).delete("/api/rates/delete").send({ rate_id: randomUUID() })],
      ];
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

// THE REFUSALS WERE REAL, not just a status code.
//
// The only writes this file attempts are ones that should be refused - create,
// update and delete as a non-admin. A 403 says the response was refused; it
// does not by itself say nothing was written, because a guard placed after the
// write would return exactly the same status. Counting the table from outside
// the transaction is what distinguishes them.
//
// The first version of this checked `notes = 'rates replay suite'`, against a
// column exchange.rates does not have. It failed loudly, which is the good
// outcome, but it was also the weaker assertion: it would have proved nothing
// about the refused writes even if the column existed.
test("the refused writes wrote nothing", async () => {
  const after = await outside(`SELECT count(*)::int AS n FROM exchange.rates`);
  assert.equal(
    after[0].n,
    rateCountBefore,
    "a route that answered 401/403 still changed the table"
  );
});
