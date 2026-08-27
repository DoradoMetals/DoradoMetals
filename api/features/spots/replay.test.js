// The spot price endpoint, over real HTTP.
//
// One route, no guard, and that is correct: the pricing page quotes metal
// prices to anyone who visits. It is also the most-called endpoint in the API
// and the one every calculation downstream depends on - an ask that arrives
// wrong makes every quote wrong, so what matters here is the SHAPE and that no
// admin-only field rides along.
//
// SPOTS_WIRE exists for this feature, so a second thing matters: the response
// must stay the shape the frontend destructures while the switch is on
// `legacy`. That is asserted directly rather than left to the wire contract,
// because a contract that is never exercised over HTTP proves nothing about
// what a browser receives.
//
// NOTHING IS COMMITTED - this file only reads, but it runs inside the pin like
// the rest so a future write cannot escape.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let metals;

// THE FIXTURE READS THE TABLE THE ENDPOINT READS, WHICH IS NO LONGER exchange.
//
// This selected `FROM exchange.metals` and started failing the moment spots was
// restructured, because the endpoint now serves spots.spots joined to
// metals.metals. The failure was real and worth reading before repointing it:
// the two tables genuinely disagreed, by $3.93 on gold.
//
// The cause was a long-running dev server started before the restructure. Its
// cron writes exchange.metals ONLY - that was the behaviour with
// SPOTS_SOURCE=exchange - so exchange kept moving while spots.spots stayed at
// whatever the last run of the current code left. It is a dev artefact, not a
// defect, and it disappears when that process is restarted onto current code,
// which writes both.
//
// What this file asks is "does the endpoint serve what is stored", so the
// fixture follows the endpoint. Whether the two SCHEMAS agree is a different
// question with its own tool - `verify:parity` - which is what noticed this.
// Asserting it here as well would make an unrelated stale process fail the
// whole suite, and would be asking parity's question in the wrong place.
before(async () => {
  metals = await outside(
    `SELECT m.name AS type, s.ask AS ask_spot, s.bid AS bid_spot
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id
      ORDER BY m.name`
  );
  assert.ok(metals.length > 0, "dev has no metals - every assertion here would be vacuous");
});

after(async () => {
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

// The fields the frontend reads. Named individually rather than deep-equalled
// so that ADDING a field is not a failure and LOSING one is.
test("every metal carries the fields a quote is built from", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots/spot_prices");
      // An empty feed would run none of the assertions below and report
      // success - and an empty spot feed is exactly the failure that prices
      // every order at nothing. Found by audit:vacuous-tests.
      assert.ok(res.body.length > 0, "the spot feed came back empty");
      for (const spot of res.body) {
        for (const field of ["type", "ask_spot", "bid_spot"]) {
          assert.ok(field in spot, `a spot is missing ${field}`);
        }
        assert.ok(
          Number.isFinite(Number(spot.ask_spot)),
          `${spot.type} has a non-numeric ask (${spot.ask_spot}) - every quote built on it is wrong`
        );
        assert.ok(
          Number(spot.ask_spot) > 0,
          `${spot.type} has an ask of ${spot.ask_spot}; a zero ask values metal at nothing`
        );
      }
    });
  });
});

// The asks must be the asks. A feed that returns the right shape with stale or
// transposed numbers passes every structural assertion.
test("the asks and bids are the ones in the table, not a transposition of them", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots/spot_prices");
      for (const row of metals) {
        const served = res.body.find((s) => s.type === row.type);
        assert.ok(served, `${row.type} is in the table and not in the feed`);
        assert.equal(
          Number(served.ask_spot).toFixed(6),
          Number(row.ask_spot).toFixed(6),
          `${row.type} was served an ask that is not the stored one`
        );
        assert.equal(
          Number(served.bid_spot).toFixed(6),
          Number(row.bid_spot).toFixed(6),
          `${row.type} was served a bid that is not the stored one`
        );
      }
    });
  });
});

// A public endpoint is the wrong place for anything internal. Asserted as an
// allowlist: a field appearing here that nobody vetted is the failure.
test("the public feed carries nothing beyond the quote fields", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/spots/spot_prices");
      const allowed = new Set([
        "id",
        "type",
        "ask_spot",
        "bid_spot",
        "dollar_change",
        "percent_change",
        "scrap_percentage",
        "premium",
        "updated_at",
        "created_at",
        "name",
        "symbol",
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
