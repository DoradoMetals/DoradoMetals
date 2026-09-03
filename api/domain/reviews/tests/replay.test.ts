// The reviews endpoints, over real HTTP. `/get_public` is unauthenticated and feeds the marketing site.
// The public read differs from admin by exactly one clause, `WHERE hidden = false` - the only thing standing between what's published and every review ever left.
// Dev holds 14 reviews, 13 hidden, so a regression that dropped the clause returns 14 instead of 1 rather than passing vacuously.
// Nothing is committed: pinned-pool.ts rolls back every query; the last test checks from outside.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
let admin: UserFixture;
let customer: UserFixture;
let visibleCount: number;
let hiddenCount: number;
const created: string[] = [];

beforeAll(async () => {
  admin = TEST_ACTOR;

  customer = TEST_CUSTOMER;

  const counts = await outside<{ visible: number; hidden: number }>(
    `SELECT count(*) FILTER (WHERE NOT hidden)::int AS visible,
            count(*) FILTER (WHERE hidden)::int AS hidden
     FROM reviews.reviews`
  );
  visibleCount = counts[0].visible;
  hiddenCount = counts[0].hidden;

  // Both halves must be non-empty: with no hidden rows, a read that ignored `hidden` would return the same list.
  assert.ok(visibleCount > 0, "dev has no visible review - the public read is untestable");
  assert.ok(hiddenCount > 0, "dev has no hidden review - the filter test would be vacuous");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// Object.assign, not a spread: an override lands on top of the defaults without copying either object's props by hand.
// created_by/updated_by are NOT fields of the create body any more (item 4):
// public.audit_stamp writes both from the connection's actor, and naming
// either here would now be a 400.
const newReview = (over: Partial<{ hidden: boolean }> = {}) =>
  Object.assign(
    {
      review_text: `left by the replay suite ${randomUUID().slice(0, 8)}`,
      rating: 5,
      name: `replay-${randomUUID().slice(0, 8)}`,
      hidden: false,
    },
    over
  );

// Named, not spread: the fixture is only ever id/name/email plus the role the call is exercising.
const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: "admin" }, fn);
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: "user" }, fn);

test("the public review list needs no session at all", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      assert.equal(res.status, 200, "the public reviews route stopped being public");
      assert.ok(Array.isArray(res.body), "the marketing site expects an array");
      assert.ok(res.body.length > 0, "dev has a visible review and none came back");
    });
  }, { actor: TEST_ACTOR.id });
});

// Not "the counts differ" - that would pass if the public read returned a hidden review and dropped a visible one. Every row is checked individually.
test("no hidden review reaches the public list", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      const leaked = res.body.filter((r: { id: string; hidden: boolean; name: string }) => r.hidden);
      assert.deepEqual(
        leaked.map((r: { id: string; hidden: boolean; name: string }) => r.id),
        [],
        `the public read returned ${leaked.length} review(s) the business hid`
      );

      // The public read also carries LIMIT 10, so this is <=, not ==.
      assert.ok(
        res.body.length <= visibleCount,
        `the public read returned ${res.body.length} of ${visibleCount} visible reviews`
      );
      assert.equal(
        res.body.length,
        Math.min(visibleCount, 10),
        "the public read returned a different number of rows than dev has visible"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// The counterpart: an admin DOES see the hidden ones. If this ever returns the same rows as the public read, the two have converged and the previous test proves nothing.
test("an admin sees the hidden reviews the public list withholds", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(async () => {
      const res = await request(app).get("/api/reviews/get_all");
      assert.equal(res.status, 200);
      const hidden = res.body.filter((r: { id: string; hidden: boolean; name: string }) => r.hidden);
      assert.equal(
        hidden.length,
        hiddenCount,
        "the admin read is not returning every hidden review"
      );
      assert.equal(res.body.length, visibleCount + hiddenCount);
    });
  }, { actor: TEST_ACTOR.id });
});

// Recorded, not fixed: the public read returns created_by/updated_by (an admin's real name) to anyone on the internet - a real leak, left alone because removing a field is a wire change and wire shapes don't move during a schema migration.
test("the public list carries no field the admin list lacks", async () => {
  await inPinnedTransaction(async () => {
    let publicFields: Set<string> | undefined;
    let adminFields: Set<string> | undefined;

    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      publicFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    await asAdmin(async () => {
      const res = await request(app).get("/api/reviews/get_all");
      adminFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    // Guarded: both sets are assigned inside callbacks, so a request that never ran left them undefined and the spread TypeError'd instead of saying which read produced nothing.
    assert.ok(publicFields, "the public read produced no fields");
    assert.ok(adminFields, "the admin read produced no fields");
    const adminSet = adminFields;
    const publicExtras = [...publicFields].filter((f) => !adminSet.has(f));
    assert.deepEqual(publicExtras, [], "the public read returns fields the admin read does not");

    for (const leaked of ["created_by", "updated_by"]) {
      assert.ok(
        publicFields?.has(leaked),
        `${leaked} is no longer public. If that was deliberate, this assertion is ` +
          `the one to delete - it records a known leak, it does not want one.`
      );
    }
  }, { actor: TEST_ACTOR.id });
});

test("every admin route refuses a signed-in non-admin", async () => {
  await inPinnedTransaction(async () => {
    await asCustomer(async () => {
      const calls = [
        ["get_all", request(app).get("/api/reviews/get_all")],
        ["get_one", request(app).get("/api/reviews/get_one").query({ review_id: randomUUID() })],
        ["create", request(app).post("/api/reviews/create").send({ review: newReview() })],
        ["update", request(app).post("/api/reviews/update").send({ review_id: randomUUID(), patch: newReview() })],
        ["delete", request(app).delete("/api/reviews/delete").send({ review_id: randomUUID() })],
      ] as Array<[string, Promise<{ status: number }>]>;
      // Declared as a tuple list: inferred, the element type collapses to `string | Test` and neither half is usable.
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} to a non-admin`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("an anonymous caller is refused every route but the public one", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_all");
      assert.ok([401, 403].includes(res.status), `get_all answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});

test("an admin creating a review round-trips, and a hidden one stays out of public", async () => {
  await inPinnedTransaction(async () => {
    const review = newReview({ hidden: true });
    await asAdmin(async () => {
      const res = await request(app).post("/api/reviews/create").send({ review });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      created.push(review.name);

      const saved = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(saved?.id, "no id came back");
      assert.equal(saved.hidden, true, "hidden was not stored as sent");
    });

    // The write is inside the pin, so the public read sees it too - an end-to-end check rather than a re-read of the same fixture.
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      assert.ok(
        !res.body.some((r: { id: string; hidden: boolean; name: string }) => r.name === review.name),
        "a review created as hidden appeared on the public list"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// The property the pin exists for.
test("nothing this file created survived the transaction", async () => {
  assert.ok(created.length > 0, "no review was created, so this proves nothing");
  for (const name of created) {
    assert.equal(
      await assertNothingEscaped("reviews.reviews", "name = $1", [name]),
      0,
      `${name} was committed to dev`
    );
  }
});
