import { test } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import query from "#shared/db/query.ts";

function deferredClient(): { client: PoolClient; resolve: () => void } {
  let resolve!: () => void;
  const pending = new Promise<{ rows: unknown[] }>((res) => {
    resolve = () => res({ rows: [] });
  });
  const client = { query: () => pending } as unknown as PoolClient;
  return { client, resolve };
}

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
  await query("SELECT 2", [], client);
});
