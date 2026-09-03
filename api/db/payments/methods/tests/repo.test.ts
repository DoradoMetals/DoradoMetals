// payments.methods - reference data, so read paths and one write.
//
// No create and no remove (see repo.ts's own header): a method is a capability
// of the business, seeded by migration, and only its fees, labels and copy are
// edited.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as methods from "#db/payments/methods/repo.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
after(async () => { client.release(); await pool.end(); });

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try { await fn(client); } finally { await client.query("ROLLBACK"); }
}

test("listFor answers one direction, list answers both", async () => {
  await inRollback(async (c: PoolClient) => {
    const purchase = await methods.listFor("purchase", c);
    assert.ok(purchase.length, "the payment methods seed is missing purchase rows");
    assert.ok(
      purchase.every((m) => m.direction === "purchase"),
      "a sale method came back for the purchase direction"
    );
    assert.ok((await methods.list(c)).length >= purchase.length);
  });
});

// (direction, type) is the natural key: it is how a payout account and a
// Stripe instrument each resolve to a method_id. If this stops matching,
// payouts silently stop resolving a method.
test("findByType resolves a method by its direction and type", async () => {
  await inRollback(async (c: PoolClient) => {
    const found = await methods.findByType("purchase", "DORADO_ACCOUNT", c);
    assert.ok(found, "DORADO_ACCOUNT did not resolve to a purchase method");
    assert.equal(found?.type, "DORADO_ACCOUNT");
    assert.equal(await methods.findByType("purchase", "NOT A METHOD", c), undefined);
  });
});

test("update writes the named column and answers true; a missing id answers false", async () => {
  await inRollback(async (c: PoolClient) => {
    const [row] = await methods.listFor("purchase", c);
    assert.ok(row, "the payment methods seed is missing rows");

    assert.equal(await methods.update(row.id, { label: "Renamed for a test" }, c), true);
    const after = await methods.getOne(row.id, c);
    assert.equal(after?.label, "Renamed for a test");
    assert.equal(after?.type, row.type, "an unnamed column was overwritten");

    assert.equal(await methods.update(randomUUID(), { label: "nobody" }, c), false);
  });
});
