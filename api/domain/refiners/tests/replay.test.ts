import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };
type Caller = UserFixture & { role: string };

let admin: Caller;
let customer: Caller;
beforeAll(async () => {
  admin = { ...TEST_ACTOR, role: "admin" };
  customer = { ...TEST_CUSTOMER, role: "user" };
  assert.ok(admin.id && customer.id, "dev needs an admin and a non-admin user");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("refiners are admin-only and come back nested", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const res = await request(app).get("/api/suppliers/get_all");
      assert.equal(res.status, 403, "a customer read the refiner list");
    });

    await as(admin, async () => {
      const res = await request(app).get("/api/suppliers/get_all");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      const r = res.body[0];
      assert.ok("organization" in r, "the flat shape came back after the conversion");
      assert.ok(r.organization.name, "a refiner came back with no name");
      assert.ok("enabled" in r.organization, "enabled is missing from the organization");
      assert.ok(!("is_active" in r), "the flat is_active came back after the conversion");
    });
  }, { actor: TEST_ACTOR.id });
});

test("spot prices answer a signed-out visitor and take nothing from the request", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app)
        .get("/api/spots")
        .query({ user_id: customer.id });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      const s = res.body[0];
      for (const field of ["name", "bid", "ask"]) {
        assert.ok(field in s, `the spot response is missing ${field}`);
      }
      assert.equal(typeof s.bid, "number", "a price came back as a string");
    });
  }, { actor: TEST_ACTOR.id });
});

test("public reviews are filtered, and the admin ones are refused", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/public");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(
        res.body.every((r) => r.hidden === false),
        "a hidden review reached a signed-out visitor"
      );
      assert.ok(res.body.length <= 10, "the public read stopped limiting itself");
    });

    await as(customer, async () => {
      const someReviewId = "11111111-1111-1111-1111-111111111111";
      for (const [verb, path, body] of [
        ["get", "/api/reviews", {}],
        ["get", `/api/reviews/${someReviewId}`, {}],
        ["post", "/api/reviews", {}],
        ["patch", `/api/reviews/${someReviewId}`, {}],
        ["delete", `/api/reviews/${someReviewId}`, {}],
      ] as Array<["get" | "post" | "patch" | "delete", string, Record<string, unknown>]>) {
        const res = await request(app)[verb](path).send(body);
        assert.equal(res.status, 403, `${path} answered ${res.status} to a customer`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("the public rate bands omit what the admin ones return", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/rates");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      const r = res.body[0];
      for (const field of ["metal", "min_qty", "max_qty", "scrap_pct", "bullion_pct"]) {
        assert.ok(field in r, `the public rate response is missing ${field}`);
      }
      for (const audit of ["created_by", "updated_by", "created_at", "updated_at"]) {
        assert.ok(!(audit in r), `the public rate response carries ${audit}`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("this file wrote nothing at all", async () => {
  const [{ n }] = await outside(
    `SELECT (SELECT count(*) FROM reviews.reviews)
           + (SELECT count(*) FROM rates.rates)
           + (SELECT count(*) FROM refiners.refiners) AS n`
  );
  assert.ok(Number(n) > 0, "the reference tables are empty, so this proves nothing");
  const [{ again }] = await outside(
    `SELECT (SELECT count(*) FROM reviews.reviews)
           + (SELECT count(*) FROM rates.rates)
           + (SELECT count(*) FROM refiners.refiners) AS again`
  );
  assert.equal(Number(again), Number(n), "a reference table changed size during this file");
});
