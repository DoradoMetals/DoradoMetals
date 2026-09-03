// The spot price endpoint, over real HTTP. No guard, correctly - the pricing page quotes metal to anyone - so what matters here is the SHAPE and that no admin-only field rides along.
// NOTHING IS COMMITTED - this file only reads, but runs inside the pin like the rest so a future write cannot escape.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// The structural subset the fixture query asks for.
type MetalFixture = { name: string; ask: number; bid: number };

let metals: MetalFixture[];

// The fixture reads spots.spots (what the endpoint serves), not exchange.metals - whether the two SCHEMAS agree is `verify:parity`'s question, not this file's.
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
      const res = await request(app).get("/api/spots/spot_prices");
      assert.equal(res.status, 200, "the public spot feed stopped being public");
      assert.ok(Array.isArray(res.body), "the pricing page expects an array");
      assert.equal(
        res.body.length,
        metals.length,
        "the feed returned a different number of metals than dev holds"
      );
    });
  });
});

// The fields the frontend reads, named individually so ADDING a field is not a failure and LOSING one is.
test("every metal carries the fields a quote is built from", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots/spot_prices");
      // An empty feed would run none of the assertions below and report success - and an empty spot feed is exactly the failure that prices every order at nothing.
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
  });
});

// The asks must be the asks - a feed with the right shape but stale or transposed numbers passes every structural assertion.
test("the asks and bids are the ones in the table, not a transposition of them", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots/spot_prices");
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
  });
});

// A public endpoint is the wrong place for anything internal - asserted as an allowlist, so a field appearing here that nobody vetted is the failure.
test("the public feed carries nothing beyond the quote fields", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots/spot_prices");
      const allowed = new Set([
        "id",
        "name",
        "ask",
        "bid",
        "dollar_change",
        "percent_change",
      ]);
      const unexpected = Object.keys(res.body[0] ?? {}).filter((k) => !allowed.has(k));
      assert.deepEqual(
        unexpected,
        [],
        `the public spot feed grew fields nobody vetted: ${unexpected.join(", ")}`
      );
    });
  });
});
