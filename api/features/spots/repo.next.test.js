// Spot repo tests against real Postgres.
//
// Spot prices feed every price the business quotes - calculateItemPrice is
// content * (bid_spot * premium) - so the properties here are pricing
// correctness, not plumbing. Each test runs inside a transaction that is rolled
// back, so the suite leaves the database as it found it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as spots from "#features/spots/repo.next.js";

let client;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

test("getAll returns one quote per metal", async () => {
  await inRollback(async (c) => {
    const rows = await spots.getAll(c);
    assert.equal(rows.length, spots.METALS.length);
    assert.deepEqual(
      [...new Set(rows.map((r) => r.name))].sort(),
      [...spots.METALS].sort()
    );
  });
});

// The repo returns the new schema's names now - metals.metals calls it `name`,
// spots.spots calls the quote columns `ask` and `bid` - and
// features/spots/wire.js renames them back for the frontend behind SPOTS_WIRE.
// The legacy half is asserted below.
//
// It used to be: exchange.metals' `type` for the name, ask_spot/bid_spot
// for the quote. The split schemas must not leak their own column names.
test("getAll returns the new schema's names", async () => {
  await inRollback(async (c) => {
    const [row] = await spots.getAll(c);
    assert.deepEqual(Object.keys(row).sort(), [
      "ask", "bid", "dollar_change", "id", "name", "percent_change",
    ]);
  });
});

test("getAll orders Gold, Silver, Platinum, Palladium", async () => {
  await inRollback(async (c) => {
    const rows = await spots.getAll(c);
    assert.deepEqual(rows.map((r) => r.name), [
      "Gold", "Silver", "Platinum", "Palladium",
    ]);
  });
});

test("updateQuotes writes a full set of quotes", async () => {
  await inRollback(async (c) => {
    await spots.updateQuotes(
      {
        Gold: { ask: 1, bid: 2, percentChange: 3, dollarChange: 4 },
        Silver: { ask: 5, bid: 6, percentChange: 7, dollarChange: 8 },
        Platinum: { ask: 9, bid: 10, percentChange: 11, dollarChange: 12 },
        Palladium: { ask: 13, bid: 14, percentChange: 15, dollarChange: 16 },
      },
      c
    );
    const rows = await spots.getAll(c);
    const gold = rows.find((r) => r.name === "Gold");
    assert.equal(gold.ask, 1);
    assert.equal(gold.bid, 2);
    assert.equal(gold.percent_change, 3);
    assert.equal(gold.dollar_change, 4);
  });
});

// The upstream feed sometimes omits a metal. Blanking its price would make
// every item in that metal cost nothing, so the previous quote must survive.
test("a metal missing from the feed keeps its previous quote", async () => {
  await inRollback(async (c) => {
    const before = (await spots.getAll(c)).find((r) => r.name === "Platinum");
    await spots.updateQuotes(
      { Gold: { ask: 1, bid: 2, percentChange: 0, dollarChange: 0 } },
      c
    );
    const after = (await spots.getAll(c)).find((r) => r.name === "Platinum");
    assert.equal(after.ask, before.ask);
    assert.equal(after.bid, before.bid);
  });
});

test("repeated updates do not create duplicate quote rows", async () => {
  await inRollback(async (c) => {
    const quotes = { Gold: { ask: 1, bid: 2, percentChange: 0, dollarChange: 0 } };
    await spots.updateQuotes(quotes, c);
    await spots.updateQuotes(quotes, c);
    const { rows } = await c.query(
      "SELECT count(*)::int AS n FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id WHERE m.name = 'Gold'"
    );
    assert.equal(rows[0].n, 1);
  });
});

test("updateQuotes stamps updated_at", async () => {
  await inRollback(async (c) => {
    await c.query("UPDATE spots.spots SET updated_at = '2000-01-01'");
    await spots.updateQuotes(
      { Gold: { ask: 1, bid: 2, percentChange: 0, dollarChange: 0 } },
      c
    );
    const { rows } = await c.query(
      "SELECT s.updated_at FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id WHERE m.name = 'Gold'"
    );
    assert.ok(new Date(rows[0].updated_at).getFullYear() > 2000);
  });
});

test("getAllMetals returns every metal even without a quote", async () => {
  await inRollback(async (c) => {
    await c.query("DELETE FROM spots.spots");
    const rows = await spots.getAllMetals(c);
    assert.equal(rows.length, spots.METALS.length);
    assert.equal(rows[0].ask, null);
  });
});
