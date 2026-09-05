import { test } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import * as creditService from "#payments/credit/service.ts";
import { aUser } from "#shared/testing/builders/index.ts";
import query from "#shared/db/query.ts";

const inPinned = <T,>(fn: (c: PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });

const aFundedCustomer = (client: PoolClient) => aUser(client, { funds: 5000 });

async function ledgerIds(client: PoolClient, user_id: string): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM payments.ledger WHERE user_id = $1`, [user_id], client
  );
  return rows.map((r) => r.id);
}

async function rowsAdded(client: PoolClient, user_id: string, before: string[]) {
  const { rows } = await query<{ type: string; amount: number; order_id: string | null }>(
    `SELECT type, amount, order_id FROM payments.ledger
      WHERE user_id = $1 AND id <> ALL($2::uuid[])`,
    [user_id, before], client
  );
  return rows;
}

test("an admin credit writes one Credit row for exactly what moved", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    const before = await ledgerIds(client, customer.id);

    await creditService.adjustDoradoCredit(customer.id, { op: "add", amount: 12.5 });

    const added = await rowsAdded(client, customer.id, before);
    assert.equal(added.length, 1, "an adjustment wrote something other than one row");
    assert.equal(added[0].type, "Credit");
    assert.equal(Number(added[0].amount), 12.5);
    assert.equal(added[0].order_id, null);
  });
});

test("a subtraction writes a Debit", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    const before = await ledgerIds(client, customer.id);

    await creditService.adjustDoradoCredit(customer.id, { op: "subtract", amount: 4.25 });

    const added = await rowsAdded(client, customer.id, before);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, "Debit");
    assert.equal(Number(added[0].amount), 4.25);
  });
});

test("an edit upwards is a Credit and an edit downwards is a Debit", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    await creditService.adjustDoradoCredit(customer.id, { op: "edit", amount: 500 });

    let before = await ledgerIds(client, customer.id);
    await creditService.adjustDoradoCredit(customer.id, { op: "edit", amount: 600 });
    let added = await rowsAdded(client, customer.id, before);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, "Credit");
    assert.equal(Number(added[0].amount), 100);

    before = await ledgerIds(client, customer.id);
    await creditService.adjustDoradoCredit(customer.id, { op: "edit", amount: 500 });
    added = await rowsAdded(client, customer.id, before);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, "Debit");
    assert.equal(Number(added[0].amount), 100);
  });
});

test("an edit that changes nothing writes no ledger row", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    await creditService.adjustDoradoCredit(customer.id, { op: "edit", amount: 100 });

    const before = await ledgerIds(client, customer.id);
    await creditService.adjustDoradoCredit(customer.id, { op: "edit", amount: 100 });
    assert.deepEqual(await rowsAdded(client, customer.id, before), []);
  });
});

test("a refused adjustment writes no ledger row and moves no balance", async () => {
  await inPinned(async (client: PoolClient) => {
    const customer = await aFundedCustomer(client);
    const before = await ledgerIds(client, customer.id);

    await assert.rejects(() => creditService.adjustDoradoCredit(customer.id, { op: "subtract", amount: Number(customer.dorado_funds) + 1,
    }));

    assert.deepEqual(await rowsAdded(client, customer.id, before), []);
    const { rows } = await query<{ dorado_funds: number }>(
      `SELECT dorado_funds FROM auth.users WHERE id = $1`, [customer.id], client
    );
    assert.equal(Number(rows[0].dorado_funds), Number(customer.dorado_funds));
  });
});
