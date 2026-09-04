// media.pdfs, append-only, against real Postgres - proves create() writes the row given and latestOfKind() reads the newest one back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import * as repo from "#db/media/pdfs/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

// THE ORDER IS BUILT PER TEST (lane 1). It used to be resolved once in
// beforeAll, OUTSIDE any transaction, so every document these tests wrote hung
// off a real order - and the "no document at all" test could only find its
// subject if dev happened to hold an order nothing had ever printed for.
const anOrderId = async (c: PoolClient) =>
  (await anOrder(c, await aUser(c), { direction: "purchase" })).id;

// LOCKS.ORDERS, transaction-scoped (lane 3, the runner conversion): this
// file picks an order off orders.orders as its FK anchor, and
// domain/orders/tests/edit-line.test.ts writes real, autocommitting rows to
// the same table under LOCKS.ORDERS - see domain/orders/tests/
// purchase-read.test.ts's own comment for the full mechanism.
// THE FILE'S LOCK, BOUND ONCE. A lock is a property of what this file
// WRITES, not of one call, so it is named here and every inRollback below
// inherits it - which is also what stops a new test being added without one.
const inRollback = rollbackIn({ lock: LOCKS.ORDERS });

test("create writes a row and returns its id", async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c);
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
    const orderId = await anOrderId(c);
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
    // A FRESH ORDER HAS NO DOCUMENTS BY CONSTRUCTION. This hunted dev for one
    // and RETURNED EARLY when it found none, so the test asserted nothing
    // whenever every order already had a document - one of the five SKIP
    // findings audit:vacuous-tests reports.
    const latest = await repo.latestOfKind({ kind: "invoice", order_id: await anOrderId(c) }, c);
    assert.equal(latest, null);
  });
});
