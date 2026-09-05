import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

type MetalFixture = { name: string; ask: number; bid: number };

let metals: MetalFixture[];

beforeAll(async () => {
  metals = await outside(
    `SELECT m.name, s.ask, s.bid
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id
      ORDER BY m.name`
  );
  assert.ok(metals.length > 0, "dev has no metals - every assertion here would be vacuous");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("the spot feed needs no session at all", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots");
      assert.equal(res.status, 200, "the public spot feed stopped being public");
      assert.ok(Array.isArray(res.body), "the pricing page expects an array");
      assert.equal(
        res.body.length,
        metals.length,
        "the feed returned a different number of metals than dev holds"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

test("every metal carries the fields a quote is built from", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots");
      assert.ok(res.body.length > 0, "the spot feed came back empty");
      for (const spot of res.body) {
        for (const field of ["name", "ask", "bid"]) {
          assert.ok(field in spot, `a spot is missing ${field}`);
        }
        assert.ok(
          Number.isFinite(Number(spot.ask)),
          `${spot.name} has a non-numeric ask (${spot.ask}) - every quote built on it is wrong`
        );
        assert.ok(
          Number(spot.ask) > 0,
          `${spot.name} has an ask of ${spot.ask}; a zero ask values metal at nothing`
        );
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("the asks and bids are the ones in the table, not a transposition of them", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots");
      for (const row of metals) {
        const served = res.body.find((s: MetalFixture) => s.name === row.name);
        assert.ok(served, `${row.name} is in the table and not in the feed`);
        assert.equal(
          Number(served.ask).toFixed(6),
          Number(row.ask).toFixed(6),
          `${row.name} was served an ask that is not the stored one`
        );
        assert.equal(
          Number(served.bid).toFixed(6),
          Number(row.bid).toFixed(6),
          `${row.name} was served a bid that is not the stored one`
        );
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("the public feed carries nothing beyond the quote fields", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots");
      const allowed = new Set([
        "id",
        "name",
        "ask",
        "bid",
        "dollar_change",
        "percent_change",
        "direction",
      ]);
      const unexpected = Object.keys(res.body[0] ?? {}).filter((k) => !allowed.has(k));
      assert.deepEqual(
        unexpected,
        [],
        `the public spot feed grew fields nobody vetted: ${unexpected.join(", ")}`
      );
    });
  }, { actor: TEST_ACTOR.id });
});

test("the feed says which way each metal moved, and a flat day is flat", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots");
      assert.ok(res.body.length > 0, "the spot feed came back empty");
      for (const spot of res.body) {
        const change = spot.dollar_change;
        const expected = change === null || Number(change) === 0
          ? "flat" : Number(change) > 0 ? "up" : "down";
        assert.equal(spot.direction, expected, `${spot.name} moved ${change} and reads ${spot.direction}`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});
