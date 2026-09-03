// The leads endpoints, over real HTTP, with the payloads the frontend sends. Drives the whole path: route, guard, controller, service, repo.
// Every route here is requireAdmin - a lead belongs to the business rather than a customer, so the admin boundary is the first thing worth asserting.
// Nothing is committed: pinned-pool.ts rolls back every query, including the writes the service makes through its own connection. The last test checks from outside.
import { test, afterAll, beforeAll } from "vitest";
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

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type LeadFixture = { id: string; name: string | null };

let admin: UserFixture;
let customer: UserFixture;
let existingLead: LeadFixture;
const created: string[] = [];

beforeAll(async () => {
  const admins = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = admins[0];
  assert.ok(admin, "dev has no admin user - every route here is requireAdmin");

  // A non-admin, to prove the guard refuses rather than merely existing.
  const users = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user - the refusal case is untested");

  const leads = await outside<LeadFixture>(`SELECT id, name FROM exchange.leads LIMIT 1`);
  existingLead = leads[0];
  assert.ok(existingLead, "dev has no lead to read back");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// `contact` is deliberately absent: a real leads.leads column create.sql does not accept, so naming it is now a 400 under strict parsing rather than a value silently dropped.
const newLead = () => ({
  name: `replay-${randomUUID().slice(0, 8)}`,
  phone: "5550000000",
  email: `replay-${randomUUID().slice(0, 8)}@example.com`,
  priority: "low",
  notes: "created by the leads replay suite",
});

// Named, not spread: the fixture is only ever id/name/email plus the role the call is exercising.
const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: "admin" }, fn);
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: "user" }, fn);

test("an anonymous request is refused before it reaches a controller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/leads/get_all");
      assert.ok([401, 403].includes(res.status), `answered with ${res.status}`);
    });
  });
});

// The guard is requireAdmin, not requireUser: "signed in" is not "allowed".
test("a signed-in customer is refused every route", async () => {
  await inPinnedTransaction(async () => {
    await asCustomer(async () => {
      const calls = [
        request(app).get("/api/leads/get_all"),
        request(app).get("/api/leads/get_one").query({ lead_id: existingLead.id }),
        request(app).post("/api/leads/create").send({ lead: newLead() }),
        request(app).post("/api/leads/update").send({ lead_id: existingLead.id, patch: {} }),
        request(app).delete("/api/leads/delete").send({ lead_id: existingLead.id }),
      ];
      for (const call of calls) {
        const res = await call;
        assert.ok(
          [401, 403].includes(res.status),
          `${res.request.method} ${res.request.url} answered ${res.status} to a non-admin`
        );
      }
    });
  });
});

test("an admin gets the list in the shape the table reads", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(async () => {
      const res = await request(app).get("/api/leads/get_all");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body), "the leads table expects an array");
      assert.ok(res.body.length > 0, "dev has leads and none came back");

      const lead = res.body[0];
      for (const field of ["id", "name", "email", "phone", "created_at"]) {
        assert.ok(field in lead, `the response is missing ${field}`);
      }
    });
  });
});

test("creating a lead round-trips and appears in the list", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(async () => {
      const lead = newLead();
      const res = await request(app).post("/api/leads/create").send({ lead });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      created.push(lead.name);

      const saved = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(saved?.id, "no id came back, so the frontend cannot select it");
      assert.equal(saved.name, lead.name, "the name was lost on the way out");

      const back = await request(app).get("/api/leads/get_all");
      assert.ok(
        back.body.some((l: { id: string; name: string }) => l.name === lead.name),
        "the lead created a moment ago is not in the list"
      );
    });
  });
});

test("updating a lead changes it and leaves the others alone", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(async () => {
      const before = await request(app).get("/api/leads/get_all");
      const target = before.body[0];
      const others = before.body.length;

      const res = await request(app)
        .post("/api/leads/update")
        .send({ lead_id: target.id, patch: { notes: "touched by the replay suite" }, user_name: admin.name });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const after = await request(app).get("/api/leads/get_all");
      assert.equal(after.body.length, others, "an update changed how many leads exist");
      const updated = after.body.find((l: { id: string; name: string }) => l.id === target.id);
      assert.equal(updated.notes, "touched by the replay suite");
    });
  });
});

// Asserted by refusal rather than by outcome: a delete a non-admin can reach is the failure that matters.
test("deleting removes exactly one lead, and only for an admin", async () => {
  await inPinnedTransaction(async () => {
    const lead = newLead();
    let id: string | undefined;

    await asAdmin(async () => {
      const made = await request(app).post("/api/leads/create").send({ lead });
      created.push(lead.name);
      id = (Array.isArray(made.body) ? made.body[0] : made.body).id;
    });

    await asCustomer(async () => {
      const res = await request(app).delete("/api/leads/delete").send({ lead_id: id });
      assert.ok([401, 403].includes(res.status), `a non-admin got ${res.status} deleting a lead`);
    });

    await asAdmin(async () => {
      const before = await request(app).get("/api/leads/get_all");
      assert.ok(before.body.some((l: { id: string; name: string }) => l.id === id), "the non-admin delete went through");

      const res = await request(app).delete("/api/leads/delete").send({ lead_id: id });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const after = await request(app).get("/api/leads/get_all");
      assert.equal(after.body.length, before.body.length - 1, "delete removed the wrong number");
      assert.ok(!after.body.some((l: { id: string; name: string }) => l.id === id), "the lead is still there");
    });
  });
});

// The property the pin exists for: every assertion above reads its own writes and passes either way if the pin stops working.
test("nothing this file created survived the transaction", async () => {
  assert.ok(created.length > 0, "no lead was created, so this proves nothing");
  for (const name of created) {
    assert.equal(
      await assertNothingEscaped("exchange.leads", "name = $1", [name]),
      0,
      `${name} was committed to dev`
    );
  }
});
