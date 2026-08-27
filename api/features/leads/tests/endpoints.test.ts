// Leads over real HTTP, through the router the app actually mounts.
//
// This is the test that proves the restructure is invisible: same paths, same
// guards, same response shapes as the implementation it replaces. It drives the
// stack end to end - route, guard, controller, service, both repos - because
// the thing worth checking is that the dual write happens inside one
// transaction, and nothing below the service can tell you that.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back, including the service's own withTransaction,
// which becomes a savepoint inside it.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, as } from "#shared/testing/session.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

await mockSessions();
const { default: app } = await import("#app");

type User = { id: string; name: string; email: string };

let admin: User;
let customer: User;

before(async () => {
  admin = (await outside<User>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`))[0];
  customer = (await outside<User>(`SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`))[0];
  assert.ok(admin, "dev has no admin user");
  assert.ok(customer, "dev has no non-admin user");
});

const NEW_LEAD = { name: "Restructure Fixture", phone: "5550001111", email: "fixture@example.invalid" };

test("a customer cannot reach any lead route", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      assert.equal((await request(app).get("/api/leads/get_all")).status, 403);
      assert.equal((await request(app).post("/api/leads/create").send({ lead: NEW_LEAD })).status, 403);
    });
  });
});

test("create writes BOTH schemas, in one transaction, with the same id", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).post("/api/leads/create").send({ lead: NEW_LEAD });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.id, "no id came back");

      // THE POINT OF THE PHASE: the row exists in both, under one id.
      const nu = await client.query(`SELECT id, name FROM leads.leads WHERE id = $1`, [res.body.id]);
      const ex = await client.query(`SELECT id, name FROM exchange.leads WHERE id = $1`, [res.body.id]);
      assert.equal(nu.rows.length, 1, "not written to leads.leads");
      assert.equal(ex.rows.length, 1, "not written to exchange.leads - the fallback would be incomplete");
      assert.equal(nu.rows[0].name, NEW_LEAD.name);
      assert.equal(ex.rows[0].name, NEW_LEAD.name);
    });
  });
});

test("the read comes from the new schema", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).post("/api/leads/create").send({ lead: NEW_LEAD });
      const id = res.body.id;

      // Diverge the two deliberately: only the new schema is read, so only its
      // value may come back. If this ever reads exchange, the assertion fails.
      await client.query(`UPDATE leads.leads SET name = $1 WHERE id = $2`, ["FROM-NEW-SCHEMA", id]);
      await client.query(`UPDATE exchange.leads SET name = $1 WHERE id = $2`, ["FROM-EXCHANGE", id]);

      const one = await request(app).get("/api/leads/get_one").query({ lead_id: id });
      assert.equal(one.status, 200);
      assert.equal(one.body.name, "FROM-NEW-SCHEMA", "the read came from exchange");
    });
  });
});

test("update writes both, and delete removes from both", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const created = (await request(app).post("/api/leads/create").send({ lead: NEW_LEAD })).body;

      const upd = await request(app)
        .post("/api/leads/update")
        .send({ lead: { ...created, name: "Renamed" }, user_name: admin.name });
      assert.equal(upd.status, 200);
      for (const t of ["leads.leads", "exchange.leads"]) {
        const { rows } = await client.query(`SELECT name FROM ${t} WHERE id = $1`, [created.id]);
        assert.equal(rows[0]?.name, "Renamed", `${t} was not updated`);
      }

      const del = await request(app).delete("/api/leads/delete").send({ lead_id: created.id });
      assert.equal(del.status, 200);
      for (const t of ["leads.leads", "exchange.leads"]) {
        const { rows } = await client.query(`SELECT 1 FROM ${t} WHERE id = $1`, [created.id]);
        assert.equal(rows.length, 0, `${t} still holds the deleted lead`);
      }
    });
  });
});

// The old implementation answered 200 with an empty body for an id that named
// nothing, which reaches the client as undefined and is indistinguishable from
// a lead with no fields.
test("an id that names no lead is 404, not an empty 200", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .get("/api/leads/get_one")
        .query({ lead_id: "11111111-1111-1111-1111-111111111111" });
      assert.equal(res.status, 404, `answered ${res.status}`);
    });
  });
});

test("deleting an id that names nothing is 404, not a success", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .delete("/api/leads/delete")
        .send({ lead_id: "11111111-1111-1111-1111-111111111111" });
      assert.equal(res.status, 404, `answered ${res.status}`);
    });
  });
});
