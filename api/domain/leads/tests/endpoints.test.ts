// Leads over real HTTP, through the router the app actually mounts.
// Drives the stack end to end - route, guard, controller, service, repo - because nothing below the service can tell you the write happens inside one transaction.
// Nothing is committed: pinned-pool.ts rolls back every query, including the service's own withTransaction as a savepoint inside it.
import { test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import { mockSessions, as } from "#shared/testing/session.ts";
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
});

// Named, not spread: the fixture is only ever id/name/email plus the role the call is exercising.
const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: "admin" }, fn);
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: "user" }, fn);

const NEW_LEAD = { name: "Restructure Fixture", phone: "5550001111", email: "fixture@example.invalid" };

test("a customer cannot reach any lead route", async () => {
  await inPinnedTransaction(async () => {
    await asCustomer(async () => {
      assert.equal((await request(app).get("/api/leads/get_all")).status, 403);
      assert.equal((await request(app).post("/api/leads/create").send({ lead: NEW_LEAD })).status, 403);
    });
  }, { actor: TEST_ACTOR.id });
});

test("create writes the row the id names", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const res = await request(app).post("/api/leads/create").send({ lead: NEW_LEAD });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.id, "no id came back");

      const nu = await client.query(`SELECT id, name FROM leads.leads WHERE id = $1`, [res.body.id]);
      assert.equal(nu.rows.length, 1, "not written to leads.leads");
      assert.equal(nu.rows[0].name, NEW_LEAD.name);
    });
  }, { actor: TEST_ACTOR.id });
});

test("the read serves what the table holds", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const res = await request(app).post("/api/leads/create").send({ lead: NEW_LEAD });
      const id = res.body.id;

      await client.query(`UPDATE leads.leads SET name = $1 WHERE id = $2`, ["FROM-NEW-SCHEMA", id]);

      const one = await request(app).get("/api/leads/get_one").query({ lead_id: id });
      assert.equal(one.status, 200);
      assert.equal(one.body.name, "FROM-NEW-SCHEMA", "the read did not serve the row");
    });
  }, { actor: TEST_ACTOR.id });
});

test("update writes the row, and delete removes it", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(async () => {
      const created = (await request(app).post("/api/leads/create").send({ lead: NEW_LEAD })).body;

      const upd = await request(app)
        .post("/api/leads/update")
        .send({ lead_id: created.id, patch: { name: "Renamed" } });
      assert.equal(upd.status, 200);
      const { rows: renamed } = await client.query(
        `SELECT name FROM leads.leads WHERE id = $1`, [created.id]);
      assert.equal(renamed[0]?.name, "Renamed", "leads.leads was not updated");

      const del = await request(app).delete("/api/leads/delete").send({ lead_id: created.id });
      assert.equal(del.status, 200);
      const { rows: gone } = await client.query(
        `SELECT 1 FROM leads.leads WHERE id = $1`, [created.id]);
      assert.equal(gone.length, 0, "leads.leads still holds the deleted lead");
    });
  }, { actor: TEST_ACTOR.id });
});

// A 200 with an empty body for an id that names nothing is indistinguishable from a lead with no fields.
test("an id that names no lead is 404, not an empty 200", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(async () => {
      const res = await request(app)
        .get("/api/leads/get_one")
        .query({ lead_id: "11111111-1111-1111-1111-111111111111" });
      assert.equal(res.status, 404, `answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});

test("deleting an id that names nothing is 404, not a success", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(async () => {
      const res = await request(app)
        .delete("/api/leads/delete")
        .send({ lead_id: "11111111-1111-1111-1111-111111111111" });
      assert.equal(res.status, 404, `answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});
