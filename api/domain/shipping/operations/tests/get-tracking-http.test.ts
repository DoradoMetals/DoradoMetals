// POST /api/shipping/get_tracking, the ALLOWED path, for real - the coverage
// hole docs/waves/test-suite-redesign.md 1.4 named ("tracking | no | yes | via
// the fetchTracking seam - the one good provider seam") and lane 7 closes.
//
// domain/shipping/operations/tests/shipment-ownership.test.ts already proves
// every refusal over HTTP and says why the ALLOWED branch could not join it:
// "the allowed path calls FedEx and rewrites rows for real, so its success
// branch is tested directly against the guard function instead." That was
// true before lane 5 (docs/waves/test-suite-redesign.md 2.4b) - there was no
// way to answer a FedEx call without reaching the real network. There is now:
// `fedex/tracking.json` is the exact cassette
// providers/shipments/tests/fedex-cassettes.test.ts records for
// `fedex.getTracking(adapters.getTrackingInput({ tracking_number:
// SANDBOX_TRACKING_NUMBER }))`, and the controller's own call
// (`operationsService.getTracking(shipment_id)`, no injected fetchTracking)
// resolves through the SAME adapter (domain/shipping/operations/handler.ts's
// `getTracking` -> `builders.getTracking(input)`, which for a FedEx carrier IS
// `adapters.getTrackingInput`) with the SAME one-field input shape
// (`{ tracking_number }`), so a shipment built with FedEx's own sandbox
// tracking number reaches the identical request and the cassette answers it.
//
// WHAT THIS PROVES, PAST A 2xx: the real removeEvents/insertEvents pair ran
// against the parsed cassette response - shipping.tracking holds the scan
// events FedEx actually sent back, not a fixture's imitation of one - and the
// shipment row's shipping_status moved off its pre-poll value.
import { test, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { withCassette } from "#shared/testing/cassettes.ts";
import { aUser, anOrder, aShipment } from "#shared/testing/builders/index.ts";

// FedEx's own documented, always-answering virtualised tracking number -
// exists only in the sandbox. Duplicated rather than imported: neither
// providers/shipments/tests/fedex-cassettes.test.ts nor tests-external/
// fedex.test.ts exports it, and both name it the same way for the same
// reason - it is a literal the cassette means, not a discovery.
const SANDBOX_TRACKING_NUMBER = "449044304137821";

let previousFedexEnv: string | undefined;

beforeAll(async () => {
  await mockSessions();
  // refuseInTests permits FEDEX_ENV=sandbox and refuses the live API - the
  // cassette was recorded from the sandbox host, so the guard has to agree
  // before nock's interception even gets a chance to answer.
  previousFedexEnv = process.env.FEDEX_ENV;
  process.env.FEDEX_ENV = "sandbox";
});

afterAll(async () => {
  process.env.FEDEX_ENV = previousFedexEnv;
  restoreSessions();
  await pool.end();
});

const { default: app } = await import("#app");

test("the shipment's own owner gets a real tracking refresh, not a guard's 403", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const order = await anOrder(c, owner, { direction: "purchase" });
    const shipment = await aShipment(c, order, {
      tracking_number: SANDBOX_TRACKING_NUMBER,
      shipping_status: "Label Created",
    });

    const before = (
      await query<{ shipping_status: string | null }>(
        `SELECT shipping_status FROM shipping.shipments WHERE id = $1`, [shipment.id], c
      )
    ).rows[0];
    assert.equal(before?.shipping_status, "Label Created");

    const res = await withCassette("fedex/tracking.json", () =>
      as(Object.assign({}, owner, { role: "user" }), () =>
        request(app)
          .post("/api/shipping/get_tracking")
          .send({ shipment_id: shipment.id })
      )
    );

    assert.equal(
      res.status, 200,
      `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`
    );
    // THE RESPONSE IS THE ShipmentView now: the parcel with its progress
    // already worked out, rather than a bag of scan rows a browser had to
    // reason over.
    assert.ok(Array.isArray(res.body.timeline), "the response carries no timeline array");
    // THE WHOLE LADDER IS DRAWN, not only the climbed part. This parcel's one
    // recorded scan is FedEx's `OC`, which the provider maps to "Label
    // Created" - our own act, which trackingTimeline drops on purpose - so
    // every stage is correctly still ahead. That the scan reached the database
    // at all is asserted on the ROWS below, which is the stronger claim.
    const stages = res.body.timeline.map((s: { stage: string }) => s.stage);
    assert.deepEqual(
      stages, ["Picked Up", "In Transit", "Out for Delivery", "Delivered"],
      "the timeline does not draw the four stages in order"
    );
    const reached = res.body.timeline.filter((s: { reached: boolean }) => s.reached);
    assert.equal(
      reached.length, 0,
      "the cassette carries only a Label Created scan, which is not a stage"
    );
    for (const step of reached) {
      assert.equal(typeof step.stage, "string", "a reached step carries no stage string");
      assert.notEqual(step.stage, "Unknown", "a scan event mapped to nothing");
      assert.ok(step.scan_time, "a reached step carries no scan time");
    }
    assert.notEqual(
      res.body.tracking_status, "Status Unknown",
      "parseTracking recognised nothing - the status map no longer covers this response"
    );

    // THE ROWS, NOT JUST THE BODY. removeEvents/insertEvents actually ran, and
    // the shipment's own status column moved with them.
    const events = (
      await query<{ status: string | null }>(
        `SELECT status FROM shipping.tracking WHERE shipment_id = $1 ORDER BY time ASC`,
        [shipment.id], c
      )
    ).rows;
    assert.ok(events.length > 0, "no shipping.tracking rows were written for this shipment");
    // Every rung the response drew as reached is a row that was actually
    // written. Not a deepEqual: the timeline drops our own "Label Created" act
    // and collapses a status repeated at one place, so it is a view of these
    // rows rather than a copy of them.
    const written = new Set(events.map((e) => e.status));
    for (const step of reached) {
      assert.ok(
        written.has(step.stage),
        `the response drew ${step.stage} as reached but no such row was written`
      );
    }

    const after = (
      await query<{ shipping_status: string | null }>(
        `SELECT shipping_status FROM shipping.shipments WHERE id = $1`, [shipment.id], c
      )
    ).rows[0];
    assert.equal(
      after?.shipping_status, res.body.shipment.shipping_status,
      "the shipment row's status was not updated to match the poll"
    );
    // NOT asserted: that the status MOVED off "Label Created" - the recorded
    // parcel's real FedEx status happens to still read "Label Created" too,
    // so a before/after inequality here would assert something the cassette
    // does not actually show. What matters, and is asserted above, is that
    // the write happened for real: real scan events landed in
    // shipping.tracking and the shipment row was patched to match them,
    // rather than the row being left untouched behind a 200.
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});
