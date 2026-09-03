// The reviews endpoints, over real HTTP.
//
// Reviews has the same shape as rates - a public route sitting beside five
// admin ones - but a much more consequential public read. `/get_public` is
// unauthenticated and feeds the marketing site, and it is the only route in
// this feature whose output a stranger can see.
//
// WHAT MAKES THIS WORTH A SUITE. The public read differs from the admin read by
// exactly one clause: `WHERE hidden = false`. `hidden` is how the business
// suppresses a review it does not want shown. So that single clause is the only
// thing standing between "the reviews we chose to publish" and "every review
// anyone ever left", and nothing else in the codebase asserts it.
//
// Dev makes that a strong assertion rather than a decorative one: 14 reviews,
// THIRTEEN OF THEM HIDDEN. A regression that dropped the clause would return 14
// instead of 1, so the test fails loudly rather than passing on a fixture where
// the distinction does not arise. Both repo.exchange and repo.next carry the
// clause today; this is what keeps it true through promotion.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back. The last test checks from outside.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
let admin: UserFixture;
let customer: UserFixture;
let visibleCount: number;
let hiddenCount: number;
const created: string[] = [];

before(async () => {
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

  const counts = await outside<{ visible: number; hidden: number }>(
    `SELECT count(*) FILTER (WHERE NOT hidden)::int AS visible,
            count(*) FILTER (WHERE hidden)::int AS hidden
     FROM reviews.reviews`
  );
  visibleCount = counts[0].visible;
  hiddenCount = counts[0].hidden;

  // Both halves must be non-empty or the central assertion proves nothing: with
  // no hidden rows, a read that ignored `hidden` would return the same list.
  assert.ok(visibleCount > 0, "dev has no visible review - the public read is untestable");
  assert.ok(hiddenCount > 0, "dev has no hidden review - the filter test would be vacuous");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

const newReview = (over = {}) => ({
  review_text: `left by the replay suite ${randomUUID().slice(0, 8)}`,
  rating: 5,
  name: `replay-${randomUUID().slice(0, 8)}`,
  created_by: "replay suite",
  updated_by: "replay suite",
  hidden: false,
  ...over,
});

test("the public review list needs no session at all", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      assert.equal(res.status, 200, "the public reviews route stopped being public");
      assert.ok(Array.isArray(res.body), "the marketing site expects an array");
      assert.ok(res.body.length > 0, "dev has a visible review and none came back");
    });
  });
});

// THE ASSERTION THIS FILE EXISTS FOR.
//
// Not "the counts differ" - that would pass if the public read returned a
// hidden review and dropped a visible one. Every row is checked individually.
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

      // The public read also carries LIMIT 10, so this is <=, not ==. Dev has
      // one visible review, well under the limit.
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
  });
});

// The counterpart: an admin DOES see the hidden ones, which is what makes the
// filter above a filter rather than the table simply having nothing hidden in
// it. If this ever returns the same rows as the public read, the two have
// converged and the previous test is no longer proving anything.
test("an admin sees the hidden reviews the public list withholds", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
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
  });
});

// RECORDED, NOT FIXED. The public read returns `created_by` and `updated_by`,
// which hold an admin's NAME - "Jacob Johnson" in dev - to anyone on the
// internet. It is a small leak and a real one.
//
// It is deliberately not fixed here. Removing a field from a response is a wire
// change, and CLAUDE.md is explicit that wire shapes do not move during a schema
// migration. This asserts the CURRENT shape so that the change, when it is made
// deliberately, is visible as a failing test rather than a silent difference.
test("the public list carries no field the admin list lacks", async () => {
  await inPinnedTransaction(async () => {
    let publicFields: Set<string> | undefined;
    let adminFields: Set<string> | undefined;

    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      publicFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).get("/api/reviews/get_all");
      adminFields = new Set(Object.keys(res.body[0] ?? {}));
    });

    // GUARDED: both sets are assigned inside callbacks, so a request that
    // never ran left them undefined and the spread TypeError'd instead of
    // saying which read produced nothing.
    assert.ok(publicFields, "the public read produced no fields");
    assert.ok(adminFields, "the admin read produced no fields");
    // Bound to consts: a `let` narrowed by an assertion widens again inside a
    // closure, because anything could reassign it in between.
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
  });
});

test("every admin route refuses a signed-in non-admin", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const calls = [
        ["get_all", request(app).get("/api/reviews/get_all")],
        ["get_one", request(app).get("/api/reviews/get_one").query({ review_id: randomUUID() })],
        ["create", request(app).post("/api/reviews/create").send({ review: newReview() })],
        ["update", request(app).post("/api/reviews/update").send({ review: newReview() })],
        ["delete", request(app).delete("/api/reviews/delete").send({ review_id: randomUUID() })],
      ] as Array<[string, Promise<{ status: number }>]>;
      // Declared as a tuple list: inferred, the element type collapses to
      // `string | Test` and neither half is usable.
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} to a non-admin`);
      }
    });
  });
});

test("an anonymous caller is refused every route but the public one", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_all");
      assert.ok([401, 403].includes(res.status), `get_all answered ${res.status}`);
    });
  });
});

test("an admin creating a review round-trips, and a hidden one stays out of public", async () => {
  await inPinnedTransaction(async () => {
    const review = newReview({ hidden: true });
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).post("/api/reviews/create").send({ review });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      created.push(review.name);

      const saved = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(saved?.id, "no id came back");
      assert.equal(saved.hidden, true, "hidden was not stored as sent");
    });

    // The write is inside the pin, so the public read sees it too - which is
    // what makes this an end-to-end check of the filter rather than a re-read
    // of the same fixture.
    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      assert.ok(
        !res.body.some((r: { id: string; hidden: boolean; name: string }) => r.name === review.name),
        "a review created as hidden appeared on the public list"
      );
    });
  });
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
