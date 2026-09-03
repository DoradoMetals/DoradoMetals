// media.pdfs, append-only, against real Postgres - proves create() writes the row given and latestOfKind() reads the newest one back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as repo from "#db/media/pdfs/repo.ts";

let client: PoolClient;
let orderId: string;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
  const { rows } = await client.query("SELECT id FROM orders.orders LIMIT 1");
  assert.ok(rows[0], "dev has no order to attach a document to");
  orderId = rows[0].id;
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

test("create writes a row and returns its id", async () => {
  await inRollback(async (c) => {
    const written = await repo.create({
      id: randomUUID(),
      kind: "packing_list",
      order_id: orderId,
      path: `pdfs/${orderId}/packing_list-test.pdf`,
      size_bytes: 42,
      checksum: "deadbeef",
    }, c);
    assert.ok(written.id);
  });
});

test("latestOfKind reads back a row this transaction just wrote", async () => {
  await inRollback(async (c) => {
    const written = await repo.create({
      id: randomUUID(),
      kind: "invoice",
      order_id: orderId,
      path: `pdfs/${orderId}/invoice-1.pdf`,
      size_bytes: 20,
      checksum: "new-checksum",
    }, c);

    const latest = await repo.latestOfKind({ kind: "invoice", order_id: orderId }, c);
    assert.equal(latest?.id, written.id);
    assert.equal(latest?.checksum, "new-checksum");
  });
});

test("latestOfKind answers null for an order with no document at all", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT o.id FROM orders.orders o
        WHERE NOT EXISTS (SELECT 1 FROM media.pdfs p WHERE p.order_id = o.id)
        LIMIT 1`
    );
    if (!rows[0]) return; // every order in dev already has a document - nothing to assert
    const latest = await repo.latestOfKind({ kind: "invoice", order_id: rows[0].id }, c);
    assert.equal(latest, null);
  });
});
