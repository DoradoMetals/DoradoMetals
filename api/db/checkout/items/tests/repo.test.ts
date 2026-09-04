// checkout.items, against real Postgres, every test rolled back.
//
// Scrap and bullion are one table; `bullion_id IS NULL` tells them apart.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { aUser, aProduct, metalId } from "#shared/testing/builders/index.ts";
import * as checkouts from "#db/checkout/checkouts/repo.ts";
import * as items from "#db/checkout/items/repo.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});
afterAll(async () => { await pool.end(); });

// A BUILT CUSTOMER HAS NO CART, so this is a create every time - no
// found-or-empty branch, and no dependence on what dev happens to hold.
const aSession = async (c: PoolClient, direction: string) => {
  const user = await aUser(c);
  const created = await checkouts.create({ user_id: user.id, direction }, c);
  return created!;
};

// Gold, by name. metals.metals holds exactly four rows and one of them IS
// Gold - naming it is the literal this test means, not a discovery.
const aMetal = (c: PoolClient) => metalId(c, "Gold");

test("a line with no product carries its own values", async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, "purchase");
    const line = await items.create(
      {
        checkout_id: session.id, bullion_id: null, metal_id: await aMetal(c),
        pre_melt: 2.5, post_melt: 2.4, purity: 0.75, content: 1.8,
        unit: "t oz", premium: 0.9, quantity: 1,
      },
      c
    );
    assert.equal(line.bullion_id, null);

    const [row] = await items.listFor(session.id, c);
    assert.equal(row.id, line.id);
    assert.equal(Number(row.purity), 0.75);
    assert.equal(Number(row.premium), 0.9);
    assert.equal(Number(row.content), 1.8);
    assert.equal(row.unit, "t oz");
  });
});

test("createMany writes every line and listFor answers them all", async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, "sale");
    const product = await aProduct(c);
    const metal_id = await aMetal(c);

    const written = await items.createMany(
      [
        {
          checkout_id: session.id, bullion_id: product.id,
          metal_id: product.metal_id, pre_melt: product.gross,
          post_melt: product.content, purity: product.purity,
          content: product.content, unit: "t oz", premium: 1.05, quantity: 3,
        },
        {
          checkout_id: session.id, bullion_id: null, metal_id,
          pre_melt: 10, purity: 0.925, content: 9.25, unit: "g", quantity: 1,
        },
      ],
      c
    );
    assert.equal(written.length, 2, "createMany did not write both lines");

    const listed = await items.listFor(session.id, c);
    assert.equal(listed.length, 2);
    const bullion = listed.find((row) => row.bullion_id !== null)!;
    assert.equal(bullion.bullion_id, product.id);
    assert.equal(Number(bullion.quantity), 3);
    assert.equal(Number(bullion.content), Number(product.content));
    assert.equal((await items.listForOrder(session.id, c)).length, 2);
  });
});

test("update writes the named column and answers true; a missing id answers false", async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, "purchase");
    const line = await items.create(
      {
        checkout_id: session.id, bullion_id: null, metal_id: await aMetal(c),
        pre_melt: 2.5, purity: 0.75, quantity: 1,
      },
      c
    );

    assert.equal(await items.update(line.id, { quantity: 4 }, c), true);
    const after = await items.getOne(line.id, c);
    assert.equal(Number(after?.quantity), 4);
    assert.equal(Number(after?.pre_melt), 2.5, "an unnamed column was overwritten");

    assert.equal(await items.update(randomUUID(), { quantity: 9 }, c), false);
  });
});

test("removeFor empties one session, and remove answers true once", async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, "purchase");
    const metal_id = await aMetal(c);
    const first = await items.create(
      { checkout_id: session.id, bullion_id: null, metal_id, quantity: 1 }, c
    );
    await items.create(
      { checkout_id: session.id, bullion_id: null, metal_id, quantity: 2 }, c
    );

    assert.equal(await items.remove(first.id, c), true);
    assert.equal(await items.remove(first.id, c), false);

    assert.equal(await items.removeFor(session.id, c), 1);
    assert.equal((await items.listFor(session.id, c)).length, 0);
  });
});
