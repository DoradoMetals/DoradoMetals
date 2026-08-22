// Rates dual-write, focused on the one that was wrong.
//
// deleteRate accepted an executor and never passed it on, so both the exchange
// delete and the mirror ran on the pool - committing immediately, outside
// whatever transaction the caller was in. A rolled-back operation would have
// left the rate deleted from both schemas.
//
// It was found by auditing every write for the executor trap rather than by a
// failure, which is why this test exists now: so it stays found.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as dual from "#features/rates/repo.dual.js";

let client;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

test("deleting a rate joins the caller's transaction on both sides", async () => {
  const other = await pool.connect();
  try {
    const { rows: [rate] } = await other.query("SELECT id FROM exchange.rates LIMIT 1");

    await client.query("BEGIN");
    await dual.deleteRate(rate.id, client);

    // Inside the transaction it is gone from both.
    const insideExchange = await client.query("SELECT 1 FROM exchange.rates WHERE id = $1", [rate.id]);
    const insideNext = await client.query("SELECT 1 FROM rates.rates WHERE id = $1", [rate.id]);
    assert.equal(insideExchange.rows.length, 0);
    assert.equal(insideNext.rows.length, 0);

    // From another connection it is still there, because nothing committed.
    const seenExchange = await other.query("SELECT 1 FROM exchange.rates WHERE id = $1", [rate.id]);
    assert.equal(seenExchange.rows.length, 1, "the delete escaped the transaction");

    await client.query("ROLLBACK");

    // And it survives the rollback, which is the whole point.
    const afterExchange = await other.query("SELECT 1 FROM exchange.rates WHERE id = $1", [rate.id]);
    const afterNext = await other.query("SELECT 1 FROM rates.rates WHERE id = $1", [rate.id]);
    assert.equal(afterExchange.rows.length, 1, "exchange lost a rate to a rolled-back delete");
    assert.equal(afterNext.rows.length, 1, "the new schema lost a rate to a rolled-back delete");
  } finally {
    other.release();
  }
});
