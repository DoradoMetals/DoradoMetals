import { test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import { mockSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

type User = { id: string; name: string; email: string };
let admin: User;
let customer: User;

beforeAll(async () => {
  admin = TEST_ACTOR;
  customer = TEST_CUSTOMER;
  assert.ok(admin && customer, "dev needs an admin and a non-admin user");
});

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: "admin" }, fn);
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: "user" }, fn);

const NEW = { name: "Restructure Fixture", review_text: "text", rating: 5, hidden: false };

test("a customer cannot reach the admin routes", async () => {
  await inPinnedTransaction(async () => {
    await asCustomer(async () => {
      assert.equal((await request(app).get("/api/reviews")).status, 403);
      assert.equal((await request(app).post("/api/reviews").send(NEW)).status, 403);
    });
  }, { actor: TEST_ACTOR.id });
});

test("create writes the row the id names", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const res = await request(app).post("/api/reviews").send(NEW);
      assert.equal(res.status, 201, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.id);

      const { rows } = await client.query(
        `SELECT name FROM reviews.reviews WHERE id = $1`, [res.body.id]);
      assert.equal(rows.length, 1, "not written to reviews.reviews");
      assert.equal(rows[0].name, NEW.name, "the wrong name was stored");
    });
  }, { actor: TEST_ACTOR.id });
});

test("the read comes from reviews.reviews, not a stale copy", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const id = (await request(app).post("/api/reviews").send(NEW)).body.id;
      await client.query(`UPDATE reviews.reviews SET name = $1 WHERE id = $2`, ["FROM-NEW-SCHEMA", id]);

      const one = await request(app).get(`/api/reviews/${id}`);
      assert.equal(one.status, 200);
      assert.equal(one.body.name, "FROM-NEW-SCHEMA", "the read did not reflect the direct write to reviews.reviews");
    });
  }, { actor: TEST_ACTOR.id });
});

test("update writes the row, and delete removes it", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const created = (await request(app).post("/api/reviews").send(NEW)).body;

      const upd = await request(app)
        .patch(`/api/reviews/${created.id}`)
        .send({ name: "Renamed" });
      assert.equal(upd.status, 200);
      const { rows: renamed } = await client.query(
        `SELECT name FROM reviews.reviews WHERE id = $1`, [created.id]);
      assert.equal(renamed[0]?.name, "Renamed", "reviews.reviews was not updated");

      assert.equal((await request(app).delete(`/api/reviews/${created.id}`)).status, 200);
      const { rows: gone } = await client.query(
        `SELECT 1 FROM reviews.reviews WHERE id = $1`, [created.id]);
      assert.equal(gone.length, 0, "reviews.reviews still holds the deleted review");
    });
  }, { actor: TEST_ACTOR.id });
});

test("an anonymous visitor sees public reviews and never a hidden one", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    let hiddenId: string;
    await asAdmin(async () => {
      hiddenId = (await request(app).post("/api/reviews")
        .send({
          name: "HIDDEN FIXTURE", review_text: NEW.review_text, rating: NEW.rating, hidden: true,
        })).body.id;
    });
    const { rows } = await client.query(`SELECT hidden FROM reviews.reviews WHERE id = $1`, [hiddenId!]);
    assert.equal(rows[0]?.hidden, true, "the fixture is not hidden - this test would prove nothing");

    await anonymous(async () => {
      const res = await request(app).get("/api/reviews/public");
      assert.equal(res.status, 200, "the public read is not reachable anonymously");
      assert.ok(Array.isArray(res.body));
      assert.ok(
        !res.body.some((r: { id: string }) => r.id === hiddenId),
        "a hidden review reached an anonymous visitor"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

test("an id that names no review is 404, not an empty 200", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(async () => {
      const res = await request(app).get("/api/reviews/11111111-1111-1111-1111-111111111111");
      assert.equal(res.status, 404, `answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});
