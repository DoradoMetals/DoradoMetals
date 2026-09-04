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

const SANDBOX_TRACKING_NUMBER = "449044304137821";

let previousFedexEnv: string | undefined;

beforeAll(async () => {
  await mockSessions();
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
    assert.ok(Array.isArray(res.body.timeline), "the response carries no timeline array");
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

    const events = (
      await query<{ status: string | null }>(
        `SELECT status FROM shipping.tracking WHERE shipment_id = $1 ORDER BY time ASC`,
        [shipment.id], c
      )
    ).rows;
    assert.ok(events.length > 0, "no shipping.tracking rows were written for this shipment");
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
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});
