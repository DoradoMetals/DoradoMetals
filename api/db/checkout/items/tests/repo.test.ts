// checkout.items, against real Postgres, every test rolled back.
//
// SCRAP AND BULLION ARE ONE TABLE and `bullion_id IS NULL` is what tells them
// apart, so the two list projections are what this file actually pins - a line
// that stops being scrap disappears from a cart with no error anywhere.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
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

test("a scrap line carries its own values and lists as scrap", async () => {
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

    const scrap = await items.listScrapFor(session.id, c);
    assert.equal(scrap.length, 1);
    // scrap_id and id are both the line's own id - there is no second row.
    assert.equal(scrap[0].scrap_id, line.id);
    assert.equal(scrap[0].cart_item_id, line.id);
    assert.equal(Number(scrap[0].purity), 0.75);
    assert.equal(Number(scrap[0].bid_premium), 0.9);

    assert.equal(
      (await items.listBullionFor(session.id, "purchase", c)).length, 0,
      "a scrap line came back as bullion"
    );
  });
});

test("a bullion line lists in both directions, and the sale projection is wider", async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, "sale");
    const product = await aProduct(c);
    await items.create(
      {
        checkout_id: session.id, bullion_id: product.id,
        metal_id: product.metal_id, quantity: 3,
      },
      c
    );

    const sale = await items.listBullionFor(session.id, "sale", c);
    assert.equal(sale.length, 1);
    assert.equal(sale[0].product_id, product.id);
    assert.equal(Number(sale[0].quantity), 3);
    assert.ok("mint_name" in sale[0], "the sale cart lost the mint");
    assert.ok("legal_tender" in sale[0], "the sale cart lost the tender flags");

    const purchase = await items.listBullionFor(session.id, "purchase", c);
    assert.equal(purchase.length, 1);
    assert.equal(
      "mint_name" in purchase[0], false,
      "the sell cart's projection widened - that is a wire change"
    );

    assert.equal((await items.listScrapFor(session.id, c)).length, 0);
    assert.equal((await items.listForOrder(session.id, c)).length, 1);
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
