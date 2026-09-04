// D98: THE LEDGER TAKES {op, amount} AND APPLIES IT AS A DELTA, IN A
// TRANSACTION, UNDER A ROW LOCK - not an absolute total the browser computed
// and PUT, which let two admins on a $66,999.32 ledger silently discard each
// other's write.
//
// *** THIS FILE USED TO COMMIT FOR REAL. *** `audit:test-leaks` correctly
// flagged it: it restored every balance it moved, but a `payments.ledger` row
// is append-only and cannot be put back, so a real run left seven of them
// behind - a table growing forever in every developer's database. Nothing
// here commits any more. Every test runs inside a rolled-back transaction
// (`pinned-pool.ts`) or a rolled-back pair of raw connections, and the
// properties the old file proved by committing are proved here without it:
//
//   - THE ROW LOCK ITSELF: a genuinely separate second connection cannot
//     acquire `FOR UPDATE` on the same row while `adjustDoradoCredit` holds
//     it - proven with `NOWAIT`, which fails immediately (55P03) rather than
//     waiting, so the assertion has no timing to get wrong.
//   - THE LOST-UPDATE GUARD THE LOCK EXISTS FOR: a second connection that
//     already holds the row cannot be raced past - a concurrent
//     `adjustDoradoCredit` call is provably still pending after the rival has
//     had time to run, and only completes, correctly, once the rival releases.
//     This is what "two concurrent subtractions could each pass a check only
//     one should honour" (service.ts's own comment) is actually testing.
//   - THE ARITHMETIC AND THE LEDGER ROW: ordinary pinned-transaction
//     assertions, same shape as credit-ledger.test.ts and credit-target.test.ts
//     next door.
//
// *** WHY THE LOCK TESTS USE TEST_CUSTOMER AND NOT A BUILT CUSTOMER. *** Two
// real, separate Postgres sessions have to see the SAME row before either of
// them does anything - an uncommitted INSERT from a builder is invisible
// outside the transaction that made it, by MVCC design, so a two-connection
// test needs a row that was committed before the test started. TEST_CUSTOMER
// is exactly that (shared/testing/actor.ts, preflight-seeded) and it owns no
// balance of its own - every test below either changes nothing that survives
// rollback, or (the arithmetic/ledger group) uses a fresh built customer
// instead, matching credit-ledger.test.ts's own style.
//
// *** WHAT A TWO-CONNECTION TEST CANNOT PROVE, given that nothing commits. ***
// Two sessions cannot observe each other's uncommitted work - that is the
// isolation guarantee, not a gap in this harness - so "two real concurrent
// callers' deltas both land, summed" cannot be demonstrated end to end
// without one of them committing. The lost-update test below proves the
// MECHANISM that makes a lost update impossible (contested access blocks
// rather than races ahead on stale data); the arithmetic group proves that
// once serialized, repeated deltas compose correctly rather than one
// silently overwriting another. Together they cover the same ground the old
// file's `Promise.all` test claimed, without needing a commit to do it.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import * as usersService from "#domain/users/service.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { aUser } from "#shared/testing/builders/index.ts";
import query from "#shared/db/query.ts";

// Every call in this file takes LOCKS.USERS - a balance adjustment is a
// locked read on auth.users held across a payments.ledger insert, and every
// other file that moves a balance takes the same lock (see locks.ts). The
// two-connection tests below rely on this too: it is what guarantees no
// OTHER file's pinned transaction is concurrently touching TEST_CUSTOMER's
// row while a rival connection is deliberately racing this one.
const inPinned = <T,>(fn: (c: PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// THE ROW LOCK: a second, genuinely separate connection cannot lock the same
// row while adjustDoradoCredit holds it.
// ---------------------------------------------------------------------------
test("adjustDoradoCredit's row lock refuses a concurrent locker on the same row", async () => {
  const rival = await pool.connect();
  try {
    await inPinned(async () => {
      await usersService.adjustDoradoCredit(TEST_CUSTOMER.id, { op: "add", amount: 1,
      });

      // adjustDoradoCredit's own COMMIT became a RELEASE SAVEPOINT here (see
      // pinned-pool.ts's nestable()) rather than a real COMMIT - and Postgres
      // only drops a row lock at the enclosing transaction's real COMMIT or
      // ROLLBACK, never at a savepoint release. So the FOR UPDATE
      // balanceForUpdate() took is still held by this connection's real,
      // still-open transaction - which is exactly what lets a second,
      // completely independent connection probe it below.
      await rival.query("BEGIN");
      await assert.rejects(
        () => rival.query(
          `SELECT dorado_funds FROM auth.users WHERE id = $1 FOR UPDATE NOWAIT`,
          [TEST_CUSTOMER.id]
        ),
        (err: unknown) => {
          const e = err as { code?: string };
          assert.equal(
            e.code, "55P03",
            "a rival connection was not refused - adjustDoradoCredit's row lock did not hold"
          );
          return true;
        }
      );
    });
  } finally {
    // Rolled back either way: the happy path rolls back deliberately, and this
    // is the safety net if an assertion above threw first.
    await rival.query("ROLLBACK").catch(() => {});
    rival.release();
  }
});

// ---------------------------------------------------------------------------
// THE LOST-UPDATE GUARD: a concurrent caller cannot race past the lock and
// act on a stale read - it waits, and only proceeds (correctly) once the
// rival releases.
// ---------------------------------------------------------------------------
test("a concurrent adjustment waits for a rival's row lock rather than racing past it", async () => {
  const rival = await pool.connect();
  try {
    await rival.query("BEGIN");
    // The rival takes the row lock first, the way a second concurrent admin
    // edit would - so adjustDoradoCredit below has no choice but to wait for
    // it, which is the entire point of balanceForUpdate's FOR UPDATE.
    await rival.query(
      `SELECT dorado_funds FROM auth.users WHERE id = $1 FOR UPDATE`,
      [TEST_CUSTOMER.id]
    );

    await inPinned(async () => {
      let settled = false;
      const attempt = usersService
        .adjustDoradoCredit(TEST_CUSTOMER.id, { op: "add", amount: 5 })
        .then((row) => { settled = true; return row; });

      // Give it every chance to (wrongly) proceed before checking.
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(
        settled, false,
        "adjustDoradoCredit resolved while a rival held the row lock - " +
          "a concurrent caller could read stale data and lose an update"
      );

      // Releasing the rival is what unblocks the waiting call - not a timeout,
      // not a retry. If the assertion above is wrong, this line still runs and
      // the call below still resolves, it just would have resolved regardless
      // of the rival.
      await rival.query("ROLLBACK");

      const row = await attempt;
      assert.equal(settled, true);
      // The rival rolled back and contributed nothing, so the only delta that
      // survives is this call's own +5 against TEST_CUSTOMER's real balance
      // (0 - shared/testing/actor.ts: it owns nothing).
      assert.equal(Number(row.dorado_funds), 5, "the adjustment did not land once the rival released the row");
    });
  } finally {
    await rival.query("ROLLBACK").catch(() => {});
    rival.release();
  }
});

// ---------------------------------------------------------------------------
// THE ARITHMETIC AND THE LEDGER ROW, on a built customer - same shape as
// credit-ledger.test.ts and credit-target.test.ts next door.
// ---------------------------------------------------------------------------
const aFundedCustomer = (client: PoolClient) => aUser(client, { funds: 1234.56 });

async function fundsOf(client: PoolClient, user_id: string): Promise<number> {
  const { rows } = await query<{ dorado_funds: number }>(
    `SELECT dorado_funds FROM auth.users WHERE id = $1`, [user_id], client
  );
  return Number(rows[0]!.dorado_funds);
}

async function ledgerRows(client: PoolClient, user_id: string) {
  const { rows } = await query<{ type: string; amount: number; user_id: string; order_id: string | null }>(
    `SELECT type, amount, user_id, order_id FROM payments.ledger WHERE user_id = $1`, [user_id], client
  );
  return rows;
}

test("`op` is the spelling, and it adds a DELTA rather than setting a total - the returned balance matches what was stored", async () => {
  await inPinned(async (client) => {
    const customer = await aFundedCustomer(client);
    const before = await fundsOf(client, customer.id);

    const res = await usersService.adjustDoradoCredit(customer.id, { op: "add", amount: 25,
    });
    assert.equal(Number(res.dorado_funds).toFixed(6), (before + 25).toFixed(6));
    assert.equal((await fundsOf(client, customer.id)).toFixed(6), (before + 25).toFixed(6));

    const rows = await ledgerRows(client, customer.id);
    assert.equal(rows.length, 1, "an adjustment wrote something other than one ledger row");
    assert.equal(rows[0]!.type, "Credit");
    assert.equal(Number(rows[0]!.amount), 25);
    // THE ACTOR: whose balance this movement is attributed to - the ledger
    // row names the customer, not the admin who clicked the button, since
    // dorado_funds belongs to the customer.
    assert.equal(rows[0]!.user_id, customer.id);
    assert.equal(rows[0]!.order_id, null, "an admin edit has no order behind it");
  });
});

test("a subtraction moves the balance down and writes a Debit", async () => {
  await inPinned(async (client) => {
    const customer = await aFundedCustomer(client);
    const before = await fundsOf(client, customer.id);

    await usersService.adjustDoradoCredit(customer.id, { op: "subtract", amount: 4.25 });
    assert.equal((await fundsOf(client, customer.id)).toFixed(6), (before - 4.25).toFixed(6));

    const rows = await ledgerRows(client, customer.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.type, "Debit");
    assert.equal(Number(rows[0]!.amount), 4.25);
  });
});

// Two deltas in a row both apply - the property an absolute total would
// break, since both would be computed from the same stale starting balance.
// Sequential rather than Promise.all deliberately: one pinned connection
// processes its query queue strictly in order regardless (so this cannot
// race either way), and firing two queries on the same client without
// awaiting between them earns pg's own "already executing a query"
// deprecation warning for no behavioural difference. This is the
// composability half of the lost-update guard, complementing the
// two-connection test above which proves contested access cannot race ahead
// in the first place.
test("two adjustments in a row both apply, which an absolute total could not guarantee", async () => {
  await inPinned(async (client) => {
    const customer = await aFundedCustomer(client);
    const before = await fundsOf(client, customer.id);

    await usersService.adjustDoradoCredit(customer.id, { op: "add", amount: 30 });
    await usersService.adjustDoradoCredit(customer.id, { op: "add", amount: 40 });

    assert.equal(
      (await fundsOf(client, customer.id)).toFixed(6),
      (before + 70).toFixed(6),
      "one of two deltas was lost"
    );
    assert.equal((await ledgerRows(client, customer.id)).length, 2, "two movements should write two ledger rows");
  });
});

// The floor was only ever checked in the browser - the column has no CHECK
// constraint, so the database would take a negative balance.
test("the server refuses to drive a balance below zero, and writes no ledger row", async () => {
  await inPinned(async (client) => {
    const customer = await aFundedCustomer(client);
    const before = await fundsOf(client, customer.id);

    await assert.rejects(
      () => usersService.adjustDoradoCredit(customer.id, { op: "subtract", amount: before + 1,
      }),
      (err: unknown) => {
        const e = err as { kind?: string; message?: string };
        assert.equal(e.kind, "invalid");
        assert.match(String(e.message), /cannot go below zero/);
        return true;
      }
    );

    assert.equal((await fundsOf(client, customer.id)).toFixed(6), before.toFixed(6), "the balance moved before being refused");
    assert.deepEqual(await ledgerRows(client, customer.id), [], "a refused adjustment wrote a ledger row");
  });
});

test("a negative `edit` is refused too", async () => {
  await inPinned(async (client) => {
    const customer = await aFundedCustomer(client);
    const before = await fundsOf(client, customer.id);

    await assert.rejects(
      () => usersService.adjustDoradoCredit(customer.id, { op: "edit", amount: -1 }),
      (err: unknown) => {
        const e = err as { kind?: string };
        assert.equal(e.kind, "invalid");
        return true;
      }
    );
    assert.equal((await fundsOf(client, customer.id)).toFixed(6), before.toFixed(6));
  });
});

// Exactly zero is a legitimate balance and must not be caught by the floor.
test("subtracting the whole balance is allowed, and lands on zero", async () => {
  await inPinned(async (client) => {
    const customer = await aFundedCustomer(client);
    const before = await fundsOf(client, customer.id);

    const res = await usersService.adjustDoradoCredit(customer.id, { op: "subtract", amount: before,
    });
    assert.equal(Number(res.dorado_funds), 0);
  });
});
