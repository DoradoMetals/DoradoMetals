// Reviews over real HTTP, through the router the app mounts.
// Drives the whole stack - route, guard, controller, service, repo - because nothing below the service can tell you the write happens inside one transaction.
// Nothing is committed: pinned-pool holds every query in one transaction that is rolled back, including the service's own, as a savepoint.
import { test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import { mockSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

type User = { id: string; name: string; email: string };
let admin: User;
let customer: User;

beforeAll(async () => {
  admin = (await outside<User>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`))[0];
  customer = (await outside<User>(`SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`))[0];
  assert.ok(admin && customer, "dev needs an admin and a non-admin user");
});

// Named, not spread: the fixture is only ever id/name/email plus the role the call is exercising.
const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: "admin" }, fn);
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: "user" }, fn);

const NEW = { name: "Restructure Fixture", review_text: "text", rating: 5, hidden: false };

test("a customer cannot reach the admin routes", async () => {
  await inPinnedTransaction(async () => {
    await asCustomer(async () => {
      assert.equal((await request(app).get("/api/reviews/get_all")).status, 403);
      assert.equal((await request(app).post("/api/reviews/create").send({ review: NEW })).status, 403);
    });
  });
});

test("create writes the row the id names", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const res = await request(app).post("/api/reviews/create").send({ review: NEW });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.id);

      const { rows } = await client.query(
        `SELECT name FROM reviews.reviews WHERE id = $1`, [res.body.id]);
      assert.equal(rows.length, 1, "not written to reviews.reviews");
      assert.equal(rows[0].name, NEW.name, "the wrong name was stored");
    });
  });
});

// Proves the read direction rather than assuming it.
test("the read comes from the new schema", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const id = (await request(app).post("/api/reviews/create").send({ review: NEW })).body.id;
      await client.query(`UPDATE reviews.reviews SET name = $1 WHERE id = $2`, ["FROM-NEW-SCHEMA", id]);
      await client.query(`UPDATE exchange.reviews SET name = $1 WHERE id = $2`, ["FROM-EXCHANGE", id]);

      const one = await request(app).get("/api/reviews/get_one").query({ review_id: id });
      assert.equal(one.status, 200);
      assert.equal(one.body.name, "FROM-NEW-SCHEMA", "the read came from exchange");
    });
  });
});

test("update writes the row, and delete removes it", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const created = (await request(app).post("/api/reviews/create").send({ review: NEW })).body;

      const upd = await request(app)
        .post("/api/reviews/update")
        .send({ review_id: created.id, patch: { name: "Renamed" } });
      assert.equal(upd.status, 200);
      const { rows: renamed } = await client.query(
        `SELECT name FROM reviews.reviews WHERE id = $1`, [created.id]);
      assert.equal(renamed[0]?.name, "Renamed", "reviews.reviews was not updated");

      assert.equal((await request(app).delete("/api/reviews/delete").send({ review_id: created.id })).status, 200);
      const { rows: gone } = await client.query(
        `SELECT 1 FROM reviews.reviews WHERE id = $1`, [created.id]);
      assert.equal(gone.length, 0, "reviews.reviews still holds the deleted review");
    });
  });
});

// get_public has no guard in front of it, so the statement is the only thing standing between an anonymous visitor and a hidden review.
test("an anonymous visitor sees public reviews and never a hidden one", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    let hiddenId: string;
    await asAdmin(async () => {
      hiddenId = (await request(app).post("/api/reviews/create")
        .send({
          review: {
            name: "HIDDEN FIXTURE", review_text: NEW.review_text, rating: NEW.rating, hidden: true,
          },
        })).body.id;
    });
    // it really is hidden in the table the public read uses
    const { rows } = await client.query(`SELECT hidden FROM reviews.reviews WHERE id = $1`, [hiddenId!]);
    assert.equal(rows[0]?.hidden, true, "the fixture is not hidden - this test would prove nothing");

    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/get_public");
      assert.equal(res.status, 200, "the public read is not reachable anonymously");
      assert.ok(Array.isArray(res.body));
      assert.ok(
        !res.body.some((r: { id: string }) => r.id === hiddenId),
        "a hidden review reached an anonymous visitor"
      );
    });
  });
});

test("an id that names no review is 404, not an empty 200", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(async () => {
      const res = await request(app).get("/api/reviews/get_one")
        .query({ review_id: "11111111-1111-1111-1111-111111111111" });
      assert.equal(res.status, 404, `answered ${res.status}`);
    });
  });
});
