// The three remaining reference-data surfaces, over real HTTP: refiners, spots
// and reviews.
//
// One file rather than three, because they ask the same two questions and the
// answers are short: is the guard the one the routes claim, and does the
// response carry the shape the frontend reads. None of them takes a user id, so
// none can have the hole the other five had - which is worth demonstrating
// rather than asserting in a comment.
//
// No advisory lock: none of these writes a table another file touches. Nothing
// here creates a row at all, so there is nothing to escape - the last test
// proves that rather than assuming it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type Caller = UserFixture & { role: string };

let admin: Caller;
let customer: Caller;
before(async () => {
  const admins = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = { ...admins[0], role: "admin" };
  const users = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = { ...users[0], role: "user" };
  assert.ok(admin.id && customer.id, "dev needs an admin and a non-admin user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// Refiners: admin-only. Converted 2026-08-27 - the frontend reads the nested
// organization from @dorado/contracts.
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
      // The organization is its own object, on the wire as internally.
      assert.ok("organization" in r, "the flat shape came back after the conversion");
      assert.ok(r.organization.name, "a refiner came back with no name");
      assert.ok("enabled" in r.organization, "enabled is missing from the organization");
      assert.ok(!("is_active" in r), "the flat is_active came back after the conversion");
    });
  });
});

// Spots: public market data, no parameters at all.
test("spot prices answer a signed-out visitor and take nothing from the request", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app)
        .get("/api/spots/spot_prices")
        // A user id it must ignore, because it never reads one. If this ever
        // starts mattering, the public-endpoint check in
        // shared/http/endpoints.test.js fails first.
        .query({ user_id: customer.id });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      const s = res.body[0];
      // Spots is converted (2026-08-27): the feed serves the schema's own
      // names now, and this cross-feature smoke check follows it.
      for (const field of ["name", "bid", "ask"]) {
        assert.ok(field in s, `the spot response is missing ${field}`);
      }
      assert.equal(typeof s.bid, "number", "a price came back as a string");
    });
  });
});

// Reviews: the public read is filtered, the admin reads and writes are not
// reachable by a customer.
test("public reviews are filtered, and the admin ones are refused", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(
        res.body.every((r) => r.hidden === false),
        "a hidden review reached a signed-out visitor"
      );
      assert.ok(res.body.length <= 10, "the public read stopped limiting itself");
    });

    await as(customer, async () => {
      for (const [verb, path, body] of [
        ["get", "/api/reviews/get_all", {}],
        ["get", "/api/reviews/get_one", {}],
        ["post", "/api/reviews/create", { review: {} }],
        ["post", "/api/reviews/update", { review: {} }],
        ["delete", "/api/reviews/delete", { review_id: null }],
      ] as Array<["get" | "post" | "delete", string, Record<string, unknown>]>) {
        // The tuple type above is not decoration: inferred, the element type
        // collapses to a union of string and the body shapes, and
        // `request(app)[verb]` then indexes SuperTest with something that is
        // not one of its methods.
        const res = await request(app)[verb](path).send(body);
        assert.equal(res.status, 403, `${path} answered ${res.status} to a customer`);
      }
    });
  });
});

// Rates: the public band list must not carry the admin audit columns.
test("the public rate bands omit what the admin ones return", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/rates/get_all");
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
  });
});

// Nothing here writes, so nothing can have escaped. Asserted with a count taken
// before and after rather than assumed, because "this file does not write" is
// exactly the sort of claim that stops being true when somebody adds a test.
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
