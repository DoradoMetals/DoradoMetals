// The harness, tested before anything is built on it.
//
// This is the check that has to be trustworthy, because everything downstream
// depends on it: if the pin silently stops working, every HTTP test in the
// suite starts committing to dev and they all keep passing, because they read
// their own writes either way. So each property is asserted from OUTSIDE the
// pinned transaction, on a connection that never sees it.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import query from "#shared/db/query.js";
import withTransaction from "#shared/db/withTransaction.js";
import { inPinnedTransaction, assertNothingEscaped } from "#shared/testing/pinned-pool.js";

after(async () => {
  await pool.end();
});

// A table nothing else in the suite writes outside its own rolled-back
// transaction, with a text column to put a sentinel in. Its real columns,
// checked rather than guessed - the first version of this invented a `message`
// column that exchange.leads has never had.
const probe = () => `pinned-probe-${randomUUID().slice(0, 8)}`;

// The escape detector has to be able to SEE, or every "0 rows escaped" below
// is a connection that cannot read rather than a write that did not happen.
// Proved against rows dev already holds rather than by breaking the pin, which
// would put real probe rows in exchange.leads to prove a point.
test("the escape check can see committed rows at all", async () => {
  assert.ok(
    (await assertNothingEscaped("exchange.leads", "1 = 1")) > 0,
    "the outside connection sees nothing at all - every escape check below is vacuous"
  );
});

test("a write through the shared executor does not escape", async () => {
  const name = probe();

  await inPinnedTransaction(async () => {
    // No client argument. This is the whole point: a repo that takes its
    // connection from the pool has to land inside the transaction anyway.
    await query(
      `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
      [name, `${name}@example.test`]
    );

    const { rows } = await query(`SELECT 1 FROM exchange.leads WHERE name = $1`, [name]);
    assert.equal(rows.length, 1, "the write did not happen at all");
  });

  assert.equal(
    await assertNothingEscaped("exchange.leads", "name = $1", [name]),
    0,
    "a write escaped the pinned transaction and is now in dev"
  );
});

// The failure mode this exists to prevent: withTransaction issues BEGIN on the
// pinned client, which is already in a transaction, and its COMMIT would end
// the outer one. Everything after it would commit for real.
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

    // Written AFTER the nested transaction committed. If that commit ended the
    // outer transaction, this one is running outside it.
    await query(
      `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
      [outer, `${outer}@example.test`]
    );
  });

  assert.equal(
    await assertNothingEscaped("exchange.leads", "name IN ($1, $2)", [inner, outer]),
    0,
    "a nested COMMIT ended the outer transaction and the writes after it escaped"
  );
});

// A rollback inside the pin has to undo only its own work.
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
  });

  assert.equal(await assertNothingEscaped("exchange.leads", "name = $1", [kept]), 0);
});

// withTransaction releases its client in a finally block. If that release were
// honoured the connection would go back to the pool mid-test and the next
// query would run outside the transaction entirely.
test("releasing the pinned client is a no-op, so the pin survives a transaction", async () => {
  const after = probe();

  await inPinnedTransaction(async () => {
    await withTransaction(async () => {});
    await query(
      `INSERT INTO exchange.leads (name, email) VALUES ($1, $2)`,
      [after, `${after}@example.test`]
    );
  });

  assert.equal(
    await assertNothingEscaped("exchange.leads", "name = $1", [after]),
    0,
    "the client was released and the next query ran on a fresh connection"
  );
});

// And the pool has to be handed back afterwards, or every test that runs later
// in the process is silently pinned to a transaction that has been rolled back.
test("the pool is restored afterwards, even when the body throws", async () => {
  const before = { connect: pool.connect, query: pool.query };

  await assert.rejects(() =>
    inPinnedTransaction(async () => {
      throw new Error("deliberate");
    })
  );

  assert.equal(pool.connect, before.connect, "pool.connect was not restored");
  assert.equal(pool.query, before.query, "pool.query was not restored");

  // And it genuinely works again.
  const { rows } = await pool.query(`SELECT 1 AS ok`);
  assert.equal(rows[0].ok, 1);
});
