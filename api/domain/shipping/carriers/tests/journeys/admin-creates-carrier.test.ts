// ADMIN CREATES A CARRIER, over real HTTP - the API-owned replacement for the
// carrier half of frontend/shared/tests/authed/admin-creates.e2e.ts
// (Playwright is going, ruling 55): create -> appears in the admin list ->
// delete.
//
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, asAdmin, as } from "#shared/testing/session.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { aUser, anAdmin, aTag } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("a carrier is created, appears in the admin list, and is deleted", async () => {
  await inPinnedTransaction(async (c) => {
    const admin = await anAdmin(c);
    const name = `e2e-create-carrier-${aTag()}`;

    const created = await asAdmin(admin, () =>
      request(app).post("/api/carriers/create").send({
        carrier: { organization: { name, enabled: true } },
      })
    );
    assert.equal(created.status, 201, created.text);
    const carrierId = created.body.id;
    assert.ok(carrierId, "the create answered no carrier id");
    assert.equal(created.body.organization.name, name);

    const all = await as(admin, () => request(app).get("/api/carriers/get"));
    assert.equal(all.status, 200);
    assert.ok(
      all.body.some(
        (cr: { id: string; organization: { name: string } }) =>
          cr.id === carrierId && cr.organization.name === name
      ),
      "the created carrier never appeared in the list"
    );

    const removed = await asAdmin(admin, () =>
      request(app).delete("/api/carriers/delete").send({ carrier_id: carrierId })
    );
    assert.equal(removed.status, 200, removed.text);

    const afterDelete = await as(admin, () => request(app).get("/api/carriers/get"));
    assert.ok(
      !afterDelete.body.some((cr: { id: string }) => cr.id === carrierId),
      "the deleted carrier is still in the list"
    );
  });
});

test("creating and deleting a carrier is admin-only; reading the list is not", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);

    const created = await as(customer, () =>
      request(app).post("/api/carriers/create").send({ carrier: {} })
    );
    assert.equal(created.status, 403, created.text);

    // GET /carriers/get is requireUser, not requireAdmin - the checkout
    // shipping-method menu reads it as any signed-in customer.
    const all = await as(customer, () => request(app).get("/api/carriers/get"));
    assert.equal(all.status, 200, all.text);
  });
});
