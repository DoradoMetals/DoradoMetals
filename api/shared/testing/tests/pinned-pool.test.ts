import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import query from "#shared/db/query.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { inPinnedTransaction, assertNothingEscaped } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";

afterAll(async () => {
  await pool.end();
});

const probe = () => `pinned-probe-${randomUUID().slice(0, 8)}`;

test("the escape check can see committed rows at all", async () => {
  assert.ok(
    (await assertNothingEscaped("exchange.leads", "1 = 1")) > 0,
    "the outside connection sees nothing at all - every escape check below is vacuous"
  );
});

test("a write through the shared executor does not escape", async () => {
  const name = probe();

  await inPinnedTransaction(async () => {
    await query(
      `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
      [name, `${name}@example.test`]
    );

    const { rows } = await query(`SELECT 1 FROM exchange.leads WHERE name = $1`, [name]);
    assert.equal(rows.length, 1, "the write did not happen at all");
  }, { actor: TEST_ACTOR.id });

  assert.equal(
    await assertNothingEscaped("exchange.leads", "name = $1", [name]),
    0,
    "a write escaped the pinned transaction and is now in dev"
  );
});

test("withTransaction nests instead of committing the outer transaction", async () => {
  const inner = probe();
  const outer = probe();

  await inPinnedTransaction(async () => {
    await withTransaction(async (client) => {
      await query(
        `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
        [inner, `${inner}@example.test`],
        client
      );
    });

    await query(
      `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
      [outer, `${outer}@example.test`]
    );
  }, { actor: TEST_ACTOR.id });

  assert.equal(
    await assertNothingEscaped("exchange.leads", "name IN ($1, $2)", [inner, outer]),
    0,
    "a nested COMMIT ended the outer transaction and the writes after it escaped"
  );
});

test("a nested rollback undoes itself and leaves the rest alone", async () => {
  const kept = probe();
  const rolled = probe();

  await inPinnedTransaction(async () => {
    await query(
      `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
      [kept, `${kept}@example.test`]
    );

    await assert.rejects(() =>
      withTransaction(async (client) => {
        await query(
          `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
          [rolled, `${rolled}@example.test`],
          client
        );
        throw new Error("deliberate");
      })
    );

    const { rows } = await query(
      `SELECT name FROM exchange.leads WHERE name IN ($1, $2)`,
      [kept, rolled]
    );
    assert.deepEqual(rows.map((r) => r.name), [kept], "the rollback took the wrong rows with it");
  }, { actor: TEST_ACTOR.id });

  assert.equal(await assertNothingEscaped("exchange.leads", "name = $1", [kept]), 0);
});

test("releasing the pinned client is a no-op, so the pin survives a transaction", async () => {
  const after = probe();

  await inPinnedTransaction(async () => {
    await withTransaction(async () => {});
    await query(
      `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
      [after, `${after}@example.test`]
    );
  }, { actor: TEST_ACTOR.id });

  assert.equal(
    await assertNothingEscaped("exchange.leads", "name = $1", [after]),
    0,
    "the client was released and the next query ran on a fresh connection"
  );
});

test("the pool is restored afterwards, even when the body throws", async () => {
  const before = { connect: pool.connect, query: pool.query };

  await assert.rejects(() =>
    inPinnedTransaction(async () => {
      throw new Error("deliberate");
    }, { actor: TEST_ACTOR.id })
  );

  assert.equal(pool.connect, before.connect, "pool.connect was not restored");
  assert.equal(pool.query, before.query, "pool.query was not restored");

  const { rows } = await pool.query(`SELECT 1 AS ok`);
  assert.equal(rows[0].ok, 1);
});
