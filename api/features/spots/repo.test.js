// Spot prices, against real Postgres.
//
// Every price in the system multiplies by one of these: a scrap payout is
// content * bid_spot * premium, a product's price is content * ask_spot *
// premium. Four rows, updated by a feed, and everything else follows them.
//
// The behaviour worth pinning is what happens when the feed is incomplete,
// because a spot that silently keeps yesterday's value is indistinguishable
// from one that updated.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as repo from "#features/spots/repo.exchange.js";

let client;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
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

const spotFor = async (c, metal) => {
  const { rows } = await c.query(
    "SELECT ask_spot, bid_spot, dollar_change, percent_change FROM exchange.metals WHERE type = $1",
    [metal]
  );
  return rows[0];
};

const quote = (over = {}) => ({ ask: 3000, bid: 2990, dollarChange: 10, percentChange: 0.3, ...over });

test("a full set of quotes updates every metal", async () => {
  await inRollback(async (c) => {
    await repo.updateQuotes(
      {
        Gold: quote({ ask: 3000, bid: 2990 }),
        Silver: quote({ ask: 40, bid: 39 }),
        Platinum: quote({ ask: 1000, bid: 990 }),
        Palladium: quote({ ask: 1100, bid: 1090 }),
      },
      c
    );
    assert.equal(Number((await spotFor(c, "Gold")).ask_spot), 3000);
    assert.equal(Number((await spotFor(c, "Silver")).bid_spot), 39);
    assert.equal(Number((await spotFor(c, "Platinum")).ask_spot), 1000);
    assert.equal(Number((await spotFor(c, "Palladium")).bid_spot), 1090);
  });
});

// The COALESCE is what makes a partial feed safe: a metal the feed did not
// mention keeps its previous price rather than being blanked to null, which
// would make every product in that metal price at zero.
test("a metal missing from the feed keeps its previous price", async () => {
  await inRollback(async (c) => {
    const before = await spotFor(c, "Silver");
    await repo.updateQuotes({ Gold: quote({ ask: 4444, bid: 4440 }) }, c);

    const gold = await spotFor(c, "Gold");
    const silver = await spotFor(c, "Silver");
    assert.equal(Number(gold.ask_spot), 4444, "the metal that was quoted did not move");
    assert.equal(Number(silver.ask_spot), Number(before.ask_spot), "an unquoted metal was changed");
    assert.notEqual(silver.ask_spot, null, "an unquoted metal was blanked");
  });
});

test("an empty feed changes nothing at all", async () => {
  await inRollback(async (c) => {
    const before = await spotFor(c, "Gold");
    await repo.updateQuotes({}, c);
    assert.deepEqual(await spotFor(c, "Gold"), before);
  });
});

// A quote of zero is a real value, not a missing one, and must not be treated
// as absent by the COALESCE - otherwise a genuine zero silently keeps the old
// price. `?? null` catches only null and undefined, so zero survives.
test("a quote of zero is applied rather than treated as missing", async () => {
  await inRollback(async (c) => {
    await repo.updateQuotes({ Gold: quote({ dollarChange: 0, percentChange: 0 }) }, c);
    const gold = await spotFor(c, "Gold");
    assert.equal(Number(gold.dollar_change), 0);
    assert.equal(Number(gold.percent_change), 0);
  });
});

// updateQuotes walks a hardcoded list of four metals rather than the table, so
// a metal added to exchange.metals but not to that list would never be
// repriced - it would hold whatever it was inserted with, indefinitely, while
// every product in it priced from a stale number. Nothing would report it.
//
// dev and production both hold exactly the four today, so this is a trap rather
// than a fault. The assertion is on the list, because that is the thing that
// has to change when a metal is added.
test("only the four metals the code knows about are repriced", async () => {
  await inRollback(async (c) => {
    // Raw exchange query: the column really is `type` here. The repos rename it
    // to `name`, exchange.metals does not.
    const { rows } = await c.query("SELECT type FROM exchange.metals ORDER BY type");
    const inTable = rows.map((r) => r.type).sort();
    assert.deepEqual(
      inTable,
      [...repo.METALS].sort(),
      "exchange.metals and the METALS list in the repo have diverged - a metal outside the list is never repriced"
    );
  });
});

// One statement for all four, so a feed cannot half-apply and leave the
// business quoting a mix of two different minutes.
test("all four move together or not at all", async () => {
  await inRollback(async (c) => {
    const before = Object.fromEntries(
      await Promise.all(repo.METALS.map(async (m) => [m, await spotFor(c, m)]))
    );
    await assert.rejects(
      () => repo.updateQuotes({ Gold: quote({ ask: "not a number" }) }, c),
      "a malformed quote was accepted"
    );
    await c.query("ROLLBACK");
    await c.query("BEGIN");
    for (const m of repo.METALS) {
      assert.equal(Number((await spotFor(c, m)).ask_spot), Number(before[m].ask_spot));
    }
  });
});

test("getAll returns the metals in a fixed order, most valuable first", async () => {
  await inRollback(async (c) => {
    const types = (await repo.getAll(c)).map((r) => r.name);
    assert.deepEqual(types, ["Gold", "Silver", "Platinum", "Palladium"]);
  });
});

test("getAll and getAllMetals return the same columns", async () => {
  await inRollback(async (c) => {
    const [a] = await repo.getAll(c);
    const [b] = await repo.getAllMetals(c);
    assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
    // Neither ships the two dead tiering columns.
    assert.equal("scrap_percentage" in a, false);
    assert.equal("bullion_percentage" in a, false);
  });
});

// Spots are NUMERIC. Without the parsers registered in db.js they arrive as
// strings and `bid * premium` concatenates instead of multiplying.
test("spot prices are numbers, not strings", async () => {
  await inRollback(async (c) => {
    for (const row of await repo.getAll(c)) {
      assert.equal(typeof row.ask, "number", `${row.name} ask was ${typeof row.ask}`);
      assert.equal(typeof row.bid, "number");
    }
  });
});

test("a quote update on a client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    const sentinel = 987654.21;
    await repo.updateQuotes({ Gold: quote({ ask: sentinel }) }, client);
    assert.equal(Number((await spotFor(client, "Gold")).ask_spot), sentinel, "the write did not happen");
    assert.notEqual(
      Number((await spotFor(other, "Gold")).ask_spot), sentinel,
      "an uncommitted spot price was visible elsewhere"
    );
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
