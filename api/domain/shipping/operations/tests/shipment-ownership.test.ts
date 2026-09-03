// A customer may only ask about their own shipment. POST /api/shipping/get_tracking took shipment_id from the body behind requireUser alone - previously recorded as harmless, wrongly: it deletes and reinserts the shipment's tracking events and rewrites its status/estimate/delivered_at (the same unconditional removeEvents that has already emptied seven production shipments' histories), so a signed-in customer holding somebody else's shipment id could overwrite their tracking and spend a FedEx call doing it.
// requireAdmin wasn't the answer: this is called from the CUSTOMER order drawers too, not just admin's.
// Only refusals are exercised over HTTP - the allowed path calls FedEx and rewrites rows for real, so its success branch is tested directly against the guard function instead.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { requireOwnShipment } from "#shared/middleware/ownership.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS.
type UserFixture = { id: string; name: string | null; email: string | null };

let shipmentId: string;
let owner: string;
let stranger: UserFixture;

beforeAll(async () => {
  const rows = await outside<{ shipment_id: string; owner: string }>(
    `SELECT s.id AS shipment_id, coalesce(po.user_id, so.user_id) AS owner
       FROM exchange.shipments s
       LEFT JOIN exchange.purchase_orders po ON po.id = s.purchase_order_id
       LEFT JOIN exchange.sales_orders so ON so.id = s.sales_order_id
      WHERE coalesce(po.user_id, so.user_id) IS NOT NULL
      LIMIT 1`
  );
  assert.ok(rows[0], "dev has no shipment whose owner can be resolved");
  shipmentId = rows[0].shipment_id;
  owner = rows[0].owner;

  const others = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users
      WHERE role IS DISTINCT FROM 'admin' AND id <> $1 LIMIT 1`,
    [owner]
  );
  stranger = others[0];
  assert.ok(stranger, "dev has no second customer - a refusal test needs somebody else");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("a customer cannot ask about another customer's shipment", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/shipping/get_tracking")
        .send({ shipment_id: shipmentId });

      assert.equal(res.status, 403, `a stranger was answered ${res.status}`);
    });
  });
});

test("an anonymous caller cannot ask about a shipment", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app)
        .post("/api/shipping/get_tracking")
        .send({ shipment_id: shipmentId });

      assert.ok([401, 403].includes(res.status), `anonymous was answered ${res.status}`);
    });
  });
});

test("a request naming no shipment is refused rather than waved through", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app).post("/api/shipping/get_tracking").send({});
      assert.equal(res.status, 400, `a request with no shipment was answered ${res.status}`);
    });
  });
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

test("the owner is allowed through, and an admin is allowed through", async () => {
  assert.deepEqual(
    await runGuard({ id: owner, role: "user" }, { shipment_id: shipmentId }),
    { refused: false },
    "the shipment's own customer was refused"
  );

  assert.deepEqual(
    await runGuard({ id: stranger.id, role: "admin" }, { shipment_id: shipmentId }),
    { refused: false },
    "an admin was refused"
  );

  const denied = await runGuard({ id: stranger.id, role: "user" }, { shipment_id: shipmentId });
  assert.equal(denied.refused, true, "a stranger was allowed through");
  assert.equal(denied.code, 403);
});
