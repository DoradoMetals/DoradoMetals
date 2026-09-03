// A customer may only ask about their own shipment. POST /api/shipping/get_tracking took shipment_id from the body behind requireUser alone - previously recorded as harmless, wrongly: it deletes and reinserts the shipment's tracking events and rewrites its status/estimate/delivered_at (the same unconditional removeEvents that has already emptied seven production shipments' histories), so a signed-in customer holding somebody else's shipment id could overwrite their tracking and spend a FedEx call doing it.
// requireAdmin wasn't the answer: this is called from the CUSTOMER order drawers too, not just admin's.
// Only refusals are exercised over HTTP - the allowed path calls FedEx and rewrites rows for real, so its success branch is tested directly against the guard function instead.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { requireOwnShipment } from "#shared/middleware/ownership.ts";
import { anId, aUser, anOrder, aShipment } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// Nothing here needs a REAL shipment to exist: the guard refuses before any
// lookup for these three, so a shaped id is enough. (requireOwnShipment reads
// fulfillments.shipments/fulfillments.fulfillments/orders.orders - a fixture
// discovered from the frozen exchange.shipments/purchase_orders/sales_orders
// was answering the question for a table this guard no longer queries.)
test("a customer cannot ask about another customer's shipment", async () => {
  await inPinnedTransaction(async () => {
    await as({ id: anId(), name: "Stranger", email: "stranger@dorado.test", role: "user" }, async () => {
      const res = await request(app)
        .post("/api/shipping/get_tracking")
        .send({ shipment_id: anId() });

      assert.equal(res.status, 403, `a stranger was answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});

test("an anonymous caller cannot ask about a shipment", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app)
        .post("/api/shipping/get_tracking")
        .send({ shipment_id: anId() });

      assert.ok([401, 403].includes(res.status), `anonymous was answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});

test("a request naming no shipment is refused rather than waved through", async () => {
  await inPinnedTransaction(async () => {
    await as({ id: anId(), name: "Stranger", email: "stranger@dorado.test", role: "user" }, async () => {
      const res = await request(app).post("/api/shipping/get_tracking").send({});
      assert.equal(res.status, 400, `a request with no shipment was answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});

// Proving this can fail usually means removing the guard and running the negative control - not here: that would be the exact bug that emptied five dev shipments' tracking histories (documented in CLAUDE.md), run for real against dev data.
// What holds instead: NOTHING ELSE on this path answers 403 (the handler has no such branch, errorHandler defaults to 500), so a passing test proves the guard is mounted and firing - grepped, not assumed. And the allowed branch is tested against the guard directly, not the route, so the suite can't quietly pass against a guard that refuses EVERYONE (secure, but broken, and it would take the customer drawers down too).
type GuardResult = { refused: boolean; code?: number };

const runGuard = (user: { id: string; role: string } | null, body: Record<string, unknown>): Promise<GuardResult> =>
  new Promise((resolve) => {
    let code: number | undefined;
    const res = {
      status(status: number) {
        // Held in a closure variable, not `this.code = code`: that property was never declared on the literal, so tsc had nothing to check.
        code = status;
        return res;
      },
      json() {
        resolve({ refused: true, code });
      },
    };
    requireOwnShipment(
      { user, body } as unknown as Parameters<typeof requireOwnShipment>[0],
      res as unknown as Parameters<typeof requireOwnShipment>[1],
      () => resolve({ refused: false })
    );
  });

// The only test that needs a REAL shipment: requireOwnShipment is called
// directly here, bypassing supertest/inPinnedTransaction's usual HTTP path,
// so its database read reaches the pool for real - which is why the fixture
// is built INSIDE a pinned transaction rather than passed in from outside: the
// pin patches the pool for exactly this call's duration, and the built rows
// disappear with it either way.
test("the owner is allowed through, and an admin is allowed through", async () => {
  await inPinnedTransaction(async (c) => {
    const owner = await aUser(c);
    const stranger = await aUser(c);
    const order = await anOrder(c, owner, { direction: "purchase" });
    const shipment = await aShipment(c, order);

    assert.deepEqual(
      await runGuard({ id: owner.id, role: "user" }, { shipment_id: shipment.id }),
      { refused: false },
      "the shipment's own customer was refused"
    );

    assert.deepEqual(
      await runGuard({ id: stranger.id, role: "admin" }, { shipment_id: shipment.id }),
      { refused: false },
      "an admin was refused"
    );

    const denied = await runGuard({ id: stranger.id, role: "user" }, { shipment_id: shipment.id });
    assert.equal(denied.refused, true, "a stranger was allowed through");
    assert.equal(denied.code, 403);
  }, { actor: TEST_ACTOR.id });
});
