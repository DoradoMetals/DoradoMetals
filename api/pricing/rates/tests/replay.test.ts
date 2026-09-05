import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };

let admin: UserFixture;
let customer: UserFixture;
let rateCountBefore: number;

beforeAll(async () => {
  admin = TEST_ACTOR;

  customer = TEST_CUSTOMER;

  const rates = await outside(`SELECT count(*)::int AS n FROM rates.rates`);
  assert.ok(rates[0].n > 0, "dev has no rates to read");
  rateCountBefore = rates[0].n;
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: "admin" }, fn);
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: "user" }, fn);

test("the public rate list needs no session at all", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/rates");
      assert.equal(res.status, 200, "the public rates route stopped being public");
      assert.ok(Array.isArray(res.body), "the pricing page expects an array");
      assert.ok(res.body.length > 0, "dev has rates and none came back");
    });
  }, { actor: TEST_ACTOR.id });
});

test("the public list does not carry anything only the admin list has", async () => {
  await inPinnedTransaction(async () => {
    let publicFields: Set<string> | undefined;
    let adminFields: Set<string> | undefined;

    await anonymous(async () => {
      const res = await request(app).get("/api/rates");
      publicFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    await asAdmin(async () => {
      const res = await request(app).get("/api/rates/admin");
      assert.equal(res.status, 200);
      assert.ok(res.body.length > 0, "the admin rates read returned nothing");
      adminFields = new Set(Object.keys(res.body[0] ?? {}));
    });

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

    console.log(
      `      public rate fields: ${publicSet.size}; admin-only: ` +
        (onlyAdmin.length ? onlyAdmin.join(", ") : "(none - the two reads are the same shape)")
    );
  }, { actor: TEST_ACTOR.id });
});

test("every writing route refuses a signed-in non-admin", async () => {
  await inPinnedTransaction(async () => {
    await asCustomer(async () => {
      const calls = [
        ["admin", request(app).get("/api/rates/admin")],
        ["one", request(app).get(`/api/rates/${randomUUID()}`)],
        ["create", request(app).post("/api/rates").send({})],
        ["update", request(app).patch(`/api/rates/${randomUUID()}`).send({})],
        ["delete", request(app).delete(`/api/rates/${randomUUID()}`)],
      ] as Array<[string, Promise<{ status: number }>]>;
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} to a non-admin`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("an anonymous caller is refused the admin read", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/rates/admin");
      assert.ok([401, 403].includes(res.status), `answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});

test("the refused writes wrote nothing", async () => {
  const after = await outside(`SELECT count(*)::int AS n FROM rates.rates`);
  assert.equal(
    after[0].n,
    rateCountBefore,
    "a route that answered 401/403 still changed the table"
  );
});

test("the tier table is public, labelled and banded", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/rates/tiers");
      assert.equal(res.status, 200, "the rates page read stopped being public");
      assert.ok(Array.isArray(res.body) && res.body.length > 0, "dev has rates and none came back");
      const [tier] = res.body;
      assert.equal(typeof tier.metal, "string");
      assert.ok(Array.isArray(tier.bands) && tier.bands.length > 0);
      assert.ok(tier.bands[0].label, "a band came back with no label to print");
      assert.ok(tier.bands[0].key, "a band came back with no column key");
      assert.equal(typeof tier.top_pct, "number", "the landing strip has no 'up to' number");
    });
  }, { actor: TEST_ACTOR.id });
});
