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

const inPinned = <T,>(fn: (c: PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });

afterAll(async () => {
  await pool.end();
});

test("adjustDoradoCredit's row lock refuses a concurrent locker on the same row", async () => {
  const rival = await pool.connect();
  try {
    await inPinned(async () => {
      await usersService.adjustDoradoCredit(TEST_CUSTOMER.id, { op: "add", amount: 1,
      });

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
    await rival.query("ROLLBACK").catch(() => {});
    rival.release();
  }
});

test("a concurrent adjustment waits for a rival's row lock rather than racing past it", async () => {
  const rival = await pool.connect();
  try {
    await rival.query("BEGIN");
    await rival.query(
      `SELECT dorado_funds FROM auth.users WHERE id = $1 FOR UPDATE`,
      [TEST_CUSTOMER.id]
    );

    await inPinned(async () => {
      let settled = false;
      const attempt = usersService
        .adjustDoradoCredit(TEST_CUSTOMER.id, { op: "add", amount: 5 })
        .then((row) => { settled = true; return row; });

      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(
        settled, false,
        "adjustDoradoCredit resolved while a rival held the row lock - " +
          "a concurrent caller could read stale data and lose an update"
      );

      await rival.query("ROLLBACK");

      const row = await attempt;
      assert.equal(settled, true);
      assert.equal(Number(row.dorado_funds), 5, "the adjustment did not land once the rival released the row");
    });
  } finally {
    await rival.query("ROLLBACK").catch(() => {});
    rival.release();
  }
});

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

test("subtracting the whole balance is allowed, and lands on zero", async () => {
  await inPinned(async (client) => {
    const customer = await aFundedCustomer(client);
    const before = await fundsOf(client, customer.id);

    const res = await usersService.adjustDoradoCredit(customer.id, { op: "subtract", amount: before,
    });
    assert.equal(Number(res.dorado_funds), 0);
  });
});
