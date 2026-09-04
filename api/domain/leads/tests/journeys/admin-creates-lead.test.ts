// ADMIN CREATES A LEAD, over real HTTP - the API-owned replacement for the
// lead half of frontend/shared/tests/authed/admin-creates.e2e.ts (Playwright
// is going, ruling 55): create -> appears in the admin list -> delete.
//
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, asAdmin, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { aUser, anAdmin, aTag } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("a lead is created, appears in the admin list, and is deleted", async () => {
  await inPinnedTransaction(async (c) => {
    const admin = await anAdmin(c);
    const name = `e2e-create-lead-${aTag()}`;

    const created = await asAdmin(admin, () =>
      request(app).post("/api/leads/create").send({
        lead: { name, phone: "7135551234", email: `${name}@example.invalid` },
      })
    );
    assert.equal(created.status, 200, created.text);
    const leadId = created.body.id;
    assert.ok(leadId, "the create answered no lead id");
    assert.equal(created.body.name, name);

    const all = await asAdmin(admin, () => request(app).get("/api/leads/get_all"));
    assert.equal(all.status, 200);
    assert.ok(
      all.body.some((l: { id: string; name: string }) => l.id === leadId && l.name === name),
      "the created lead never appeared in the admin list"
    );

    const one = await asAdmin(admin, () =>
      request(app).get(`/api/leads/get_one?lead_id=${leadId}`)
    );
    assert.equal(one.status, 200);
    assert.equal(one.body.name, name);

    const removed = await asAdmin(admin, () =>
      request(app).delete("/api/leads/delete").send({ lead_id: leadId })
    );
    assert.equal(removed.status, 200, removed.text);

    const afterDelete = await asAdmin(admin, () => request(app).get("/api/leads/get_all"));
    assert.ok(
      !afterDelete.body.some((l: { id: string }) => l.id === leadId),
      "the deleted lead is still in the admin list"
    );

    // Deleting an id already gone is a 404, not a silent 200 - leads.remove()
    // reports whether a row actually went.
    const twice = await asAdmin(admin, () =>
      request(app).delete("/api/leads/delete").send({ lead_id: leadId })
    );
    assert.equal(twice.status, 404, "deleting an already-deleted lead did not 404");
  });
});

test("leads are admin-only: a customer is refused at every one of the three calls", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);

    const created = await as(customer, () =>
      request(app).post("/api/leads/create").send({ lead: { name: "should not exist" } })
    );
    assert.equal(created.status, 403, created.text);

    const all = await as(customer, () => request(app).get("/api/leads/get_all"));
    assert.equal(all.status, 403, all.text);

    const removed = await as(customer, () =>
      request(app).delete("/api/leads/delete").send({ lead_id: TEST_ACTOR.id })
    );
    assert.equal(removed.status, 403, removed.text);
  });
});
