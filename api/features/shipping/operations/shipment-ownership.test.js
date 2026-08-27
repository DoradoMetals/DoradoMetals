// A customer may only ask about their own shipment.
//
// WHY THIS EXISTS. POST /api/shipping/get_tracking took `shipment_id` from the
// body behind requireUser alone, and FOLLOWUPS recorded the shipping reads as
// harmless because they "expose carrier reference data or a tracking status".
//
// It is not a read. operationsService.getTracking deletes and reinserts the
// shipment's tracking events and rewrites its status, estimate and
// delivered_at - the same unconditional removeEvents documented as having
// already emptied seven production shipments' histories. So a signed-in
// customer holding somebody else's shipment id could overwrite their tracking,
// and spend a FedEx call doing it.
//
// requireAdmin was not the answer: useTracking is called from the CUSTOMER
// purchase-order and sales-order drawers as well as the admin ones, checked in
// the frontend before writing requireOwnShipment.
//
// WHAT IS DRIVEN AND WHAT IS NOT. Only the refusals. A request that passes the
// guard reaches a handler that calls FedEx and rewrites rows, so the allowed
// path is deliberately not exercised over HTTP - the test proving it works
// would be the test making the call. The guard's own success branch is covered
// directly against the database instead, which is where the join it turns on
// actually lives.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { requireOwnShipment } from "#shared/middleware/ownership.ts";

await mockSessions();
const { default: app } = await import("#app");

let shipmentId, owner, stranger;

before(async () => {
  const rows = await outside(
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

  const others = await outside(
    `SELECT id, name, email FROM exchange.users
      WHERE role IS DISTINCT FROM 'admin' AND id <> $1 LIMIT 1`,
    [owner]
  );
  stranger = others[0];
  assert.ok(stranger, "dev has no second customer - a refusal test needs somebody else");
});

after(async () => {
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

// ON PROVING THIS CAN FAIL, WHICH IS USUALLY DONE BY REMOVING THE GUARD.
//
// Not here. Without requireOwnShipment the stranger's request reaches
// getTracking, which calls FedEx and deletes that shipment's tracking events -
// the negative control would be the thing the guard exists to prevent, run
// against real dev data. That is how tracking.test.js emptied five dev
// shipments' histories, and it is documented in CLAUDE.md as the bug the test
// for it committed.
//
// What holds instead, and it is enough: NOTHING ELSE ON THIS PATH ANSWERS 403.
// The handler has no such branch and errorHandler defaults to 500, so a 403 can
// only have come from this middleware - a passing test proves it is mounted and
// firing, not merely present in the file. Grepped rather than assumed.
//
// The allowed branch, against the guard rather than the route, so no FedEx call
// happens. Without this the suite would pass against a guard that refuses
// EVERYONE - which is secure and broken, and would take the customer drawers
// down with it.
const runGuard = (user, body) =>
  new Promise((resolve) => {
    const res = {
      status(code) {
        this.code = code;
        return this;
      },
      json() {
        resolve({ refused: true, code: this.code });
      },
    };
    requireOwnShipment({ user, body }, res, () => resolve({ refused: false }));
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
