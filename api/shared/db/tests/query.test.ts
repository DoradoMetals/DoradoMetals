// The shared executor's concurrency guard. A single pg client can only run
// one statement at a time - pg queues a second call issued while the first
// is still executing and just warns about it today ("client.query() while
// already executing"), turning it into a thrown error in pg@9. That was
// found happening for real: a Promise.all fanning out several repo calls
// over one transaction client (domain/fulfillments/service.ts's detailsFor,
// domain/products/compose.ts's labels). The guard makes that failure loud
// and immediate in tests instead of a warning nobody reads.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import query from "#shared/db/query.ts";

// A fake client whose query() never resolves until told to - lets a test
// force two calls to genuinely overlap without a real connection.
function deferredClient(): { client: PoolClient; resolve: () => void } {
  let resolve!: () => void;
  const pending = new Promise<{ rows: unknown[] }>((res) => {
    resolve = () => res({ rows: [] });
  });
  const client = { query: () => pending } as unknown as PoolClient;
  return { client, resolve };
}

// A fake client whose query() resolves immediately (a fresh promise each
// call) - for proving sequential, awaited use is unaffected.
function instantClient(): PoolClient {
  return { query: async () => ({ rows: [] }) } as unknown as PoolClient;
}

test("throws when a second query is issued before the first settles on the same client", async () => {
  const { client, resolve } = deferredClient();
  const first = query("SELECT 1", [], client);

  await assert.rejects(
    query("SELECT 2", [], client),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /already executing another query/);
      assert.match(err.message, /SELECT 1/);
      assert.match(err.message, /SELECT 2/);
      return true;
    }
  );

  resolve();
  await first;
});

test("a second query on a DIFFERENT client is unaffected", async () => {
  const a = deferredClient();
  const b = instantClient();
  const firstOnA = query("SELECT 1", [], a.client);

  // No collision - different client, so this must resolve, not throw.
  await query("SELECT 2", [], b);

  a.resolve();
  await firstOnA;
});

test("sequential, awaited calls on the same client never throw", async () => {
  const client = instantClient();
  await query("SELECT 1", [], client);
  await query("SELECT 2", [], client);
  await query("SELECT 3", [], client);
});

test("the client is free again after a query settles, even a rejected one", async () => {
  let calls = 0;
  const client = {
    query: async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return { rows: [] };
    },
  } as unknown as PoolClient;

  await assert.rejects(query("SELECT 1", [], client), /boom/);
  // The failed query must have released its slot - a second, SEQUENTIAL call
  // on the same client is a new statement, not one racing the first.
  await query("SELECT 2", [], client);
});
