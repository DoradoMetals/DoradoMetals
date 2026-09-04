import { test } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import withTransaction from "#shared/db/withTransaction.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { runWithActor } from "#shared/http/actor.ts";

const actorSetting = (c: PoolClient) =>
  c.query("SELECT current_setting('app.actor_id', true) AS actor").then((r) => r.rows[0].actor);

test("returns fn's resolved value, unchanged", async () => {
  await inPinnedTransaction(async () => {
    const result = await withTransaction(async () => ({ id: "abc", n: 3 }));
    assert.deepEqual(result, { id: "abc", n: 3 });
  });
});

test("commits: a write inside fn is visible to the caller afterward", async () => {
  await inPinnedTransaction(async (client) => {
    await client.query("CREATE TEMPORARY TABLE wtx_commit_probe (n int)");
    await withTransaction(async (c) => {
      await c.query("INSERT INTO wtx_commit_probe (n) VALUES (1)");
    });
    const { rows } = await client.query("SELECT count(*)::int AS n FROM wtx_commit_probe");
    assert.equal(rows[0].n, 1);
  });
});

test("rolls back and rethrows the original error, unchanged, when fn throws", async () => {
  await inPinnedTransaction(async (client) => {
    await client.query("CREATE TEMPORARY TABLE wtx_rollback_probe (n int)");

    let caught: (Error & { code?: string }) | undefined;
    try {
      await withTransaction(async (c) => {
        await c.query("INSERT INTO wtx_rollback_probe (n) VALUES (1)");
        await c.query("SELECT 1/0");
      });
    } catch (err) {
      caught = err as Error & { code?: string };
    }

    assert.ok(caught, "withTransaction swallowed the error instead of rethrowing it");
    assert.equal(caught!.code, "22012", "the original pg error code was not preserved");
    assert.match(caught!.message, /division by zero/);

    const { rows } = await client.query("SELECT count(*)::int AS n FROM wtx_rollback_probe");
    assert.equal(rows[0].n, 0, "a row written before the throw survived the rollback");
  });
});

test("the rollback actually runs: the connection accepts a query right after the throw", async () => {
  await inPinnedTransaction(async (client) => {
    await assert.rejects(() => withTransaction(async (c) => { await c.query("SELECT 1/0"); }));
    const { rows } = await client.query("SELECT 1 AS ok");
    assert.equal(rows[0].ok, 1);
  });
});

test("stamps the connection with the ambient actor when none is given explicitly", async () => {
  const ACTOR = "11111111-1111-1111-1111-111111111111";
  await inPinnedTransaction(async () => {
    await runWithActor(ACTOR, async () => {
      const seen = await withTransaction((c) => actorSetting(c));
      assert.equal(seen, ACTOR);
    });
  });
});

test("an explicit actor overrides the ambient one", async () => {
  const AMBIENT = "22222222-2222-2222-2222-222222222222";
  const EXPLICIT = "33333333-3333-3333-3333-333333333333";
  await inPinnedTransaction(async () => {
    await runWithActor(AMBIENT, async () => {
      const seen = await withTransaction((c) => actorSetting(c), { actor: EXPLICIT });
      assert.equal(seen, EXPLICIT);
    });
  });
});

test("with no actor anywhere, the connection sees an empty string, not null", async () => {
  await inPinnedTransaction(async () => {
    const seen = await withTransaction((c) => actorSetting(c));
    assert.equal(seen, "");
  });
});

test("actor: null resolves to an empty string outside any ambient context (the cron/webhook case)", async () => {
  await inPinnedTransaction(async () => {
    const seen = await withTransaction((c) => actorSetting(c), { actor: null });
    assert.equal(seen, "");
  });
});

test("actor: null does not override an ambient actor already in scope", async () => {
  const AMBIENT = "44444444-4444-4444-4444-444444444444";
  await inPinnedTransaction(async () => {
    await runWithActor(AMBIENT, async () => {
      const seen = await withTransaction((c) => actorSetting(c), { actor: null });
      assert.equal(seen, AMBIENT);
    });
  });
});
