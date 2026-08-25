// The scrap repo, against real Postgres.
//
// A scrap row's `content` is troy ounces of pure metal, and it is what the
// customer is paid for: content * spot * premium. `content_actual` is the same
// figure after the parcel was melted and assayed - the record of what was
// really recovered, which migration 033 went to some trouble to preserve.
//
// Both are computed in updateScrapItem rather than supplied, which is where the
// interesting behaviour is.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.js";
import * as repo from "#features/scrap/repo.js";

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
  // TWO GROUPS, because this file writes tables from both and used to take
  // neither. It deletes exchange.scrap - which the checkout tests hold
  // SCRAP_SWEEP for - and exchange.purchase_order_items, which the orders tests
  // touch under ORDERS. With no lock at all it was a third party writing both,
  // and it deadlocked in a full run having passed in every earlier one.
  //
  // takeLocks sorts, so the two are always acquired in the same order.
  await takeLocks(client, [LOCKS.SCRAP_SWEEP, LOCKS.ORDERS]);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// A scrap row with known figures, so the arithmetic is checkable.
const aScrapRow = async (c, over = {}) => {
  const { rows: [metal] } = await c.query("SELECT id FROM exchange.metals LIMIT 1");
  const r = { pre_melt: 10, purity: 0.9, content: 9, gross_unit: "t oz", bid_premium: 0.75, ...over };
  const { rows: [row] } = await c.query(
    `INSERT INTO exchange.scrap (id, metal_id, pre_melt, purity, content, gross_unit, bid_premium)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING *`,
    [metal.id, r.pre_melt, r.purity, r.content, r.gross_unit, r.bid_premium]
  );
  return row;
};

test("createNewItem derives content from weight and purity", async () => {
  await inRollback(async (c) => {
    const id = await repo.createNewItem(
      { metal: "Gold", pre_melt: 4, purity: 0.5, gross_unit: "t oz" }, c
    );
    const { rows: [row] } = await c.query("SELECT content FROM exchange.scrap WHERE id = $1", [id]);
    assert.equal(Number(row.content), 2);
  });
});

test("createNewItem falls back to a default premium rather than none", async () => {
  await inRollback(async (c) => {
    const id = await repo.createNewItem({ metal: "Gold" }, c);
    const { rows: [row] } = await c.query("SELECT bid_premium, content FROM exchange.scrap WHERE id = $1", [id]);
    assert.equal(Number(row.bid_premium), 0.75);
    assert.equal(Number(row.content), 1);
  });
});

test("updateScrapItem recomputes content from the weight it is given", async () => {
  await inRollback(async (c) => {
    const row = await aScrapRow(c);
    await repo.updateScrapItem({ item: { scrap: { ...row, post_melt: 8, purity: 0.5 } } }, c);
    const { rows: [after] } = await c.query("SELECT content FROM exchange.scrap WHERE id = $1", [row.id]);
    // post_melt wins over pre_melt when present: 8 * 0.5.
    assert.equal(Number(after.content), 4);
  });
});

test("content is converted to troy ounces from whatever unit was weighed", async () => {
  await inRollback(async (c) => {
    const row = await aScrapRow(c, { gross_unit: "dwt" });
    await repo.updateScrapItem({ item: { scrap: { ...row, post_melt: 20, purity: 1 } } }, c);
    const { rows: [after] } = await c.query("SELECT content FROM exchange.scrap WHERE id = $1", [row.id]);
    // 20 dwt is one troy ounce.
    assert.equal(Number(after.content), 1);
  });
});

// The one worth reading twice. An admin editing a row that has no assay yet -
// 49 of production's 105 scrap rows - gets purity_actual filled in from purity,
// which is right, and content_actual written as 0, which disagrees with it.
//
// The cause is operator precedence: `a * b ?? c` parses as `(a * b) ?? c`, and
// `??` only catches null and undefined. Multiplying by a null purity_actual
// gives 0, not null, so the intended fallback to `content` never fires. The
// same expression can produce NaN if a figure is undefined rather than null,
// and Postgres stores NaN in a numeric column without complaint.
//
// Pinned rather than fixed: whether content_actual should fall back to content
// or stay null until a real assay exists is a question about what the row
// claims, not about JavaScript. See FOLLOWUPS.
test("editing a row with no assay writes content_actual as zero", async () => {
  await inRollback(async (c) => {
    const row = await aScrapRow(c);
    assert.equal(row.content_actual, null);

    await repo.updateScrapItem(
      { item: { scrap: { ...row, post_melt: null, purity_actual: null, post_melt_actual: null } } }, c
    );

    const { rows: [after] } = await c.query(
      "SELECT content, purity_actual, content_actual FROM exchange.scrap WHERE id = $1", [row.id]
    );
    assert.equal(Number(after.purity_actual), 0.9, "purity_actual should fall back to purity");
    assert.equal(Number(after.content_actual), 0, "the documented behaviour has changed - update the test");
    assert.notEqual(Number(after.content_actual), Number(after.content));
  });
});

test("a real assay is recorded as given", async () => {
  await inRollback(async (c) => {
    const row = await aScrapRow(c);
    await repo.updateScrapItem(
      { item: { scrap: { ...row, post_melt_actual: 8, purity_actual: 0.8 } } }, c
    );
    const { rows: [after] } = await c.query(
      "SELECT purity_actual, content_actual FROM exchange.scrap WHERE id = $1", [row.id]
    );
    assert.equal(Number(after.purity_actual), 0.8);
    assert.equal(Number(after.content_actual), 6.4);
  });
});

// deleteItems removes scrap by id with no reference check, and the database
// does not refuse: purchase_order_items.scrap_id is ON DELETE SET NULL. So
// deleting scrap that belongs to an order succeeds silently and leaves the
// order line pointing at nothing - no scrap_id and no product_id, which the
// composed order query reports as item_type 'unknown'.
//
// What is lost is the weights, the purity and the assay figures: the record of
// what the customer actually sent and what was recovered from it. That exists
// nowhere else once the scrap row is gone.
//
// Production currently has no such orphaned line - 81 scrap-backed and 7
// product-backed of 88 - so this is a latent hazard rather than live damage.
// Asserted as behaviour, because adding a guard changes what an admin delete
// does. See FOLLOWUPS.
test("deleting scrap an order points at succeeds and orphans the line", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT id, scrap_id FROM exchange.purchase_order_items
       WHERE scrap_id IS NOT NULL AND product_id IS NULL LIMIT 1`
    );
    if (!rows.length) return;
    const { id, scrap_id } = rows[0];

    await repo.deleteItems([scrap_id], c);

    const { rows: [line] } = await c.query(
      "SELECT scrap_id, product_id FROM exchange.purchase_order_items WHERE id = $1", [id]
    );
    assert.equal(line.scrap_id, null, "the foreign key no longer sets null - update the test");
    assert.equal(line.product_id, null);

    const gone = await c.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [scrap_id]);
    assert.equal(gone.rows.length, 0, "the scrap row survived");
  });
});

test("deleting unreferenced scrap works, and only the named rows go", async () => {
  await inRollback(async (c) => {
    const keep = await aScrapRow(c);
    const drop = await aScrapRow(c);
    await repo.deleteItems([drop.id], c);

    const gone = await c.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [drop.id]);
    const kept = await c.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [keep.id]);
    assert.equal(gone.rows.length, 0);
    assert.equal(kept.rows.length, 1);
  });
});

test("a scrap write on a client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    const row = await aScrapRow(client);
    const seen = await other.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [row.id]);
    assert.equal(seen.rows.length, 0, "an uncommitted scrap row was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
