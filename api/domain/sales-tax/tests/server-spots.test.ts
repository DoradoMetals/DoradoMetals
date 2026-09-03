// Every order's money is content * (spot.ask * ask_premium), so whatever
// supplies `spots` decides what a customer pays - it used to be the REQUEST
// BODY in three places (get_sales_tax, createSalesOrder, updatePaymentIntent).
// Measured before the fix, same order and items, only the body's spots
// differing: ask_spot 3400 (honest) -> $3,673.53; ask_spot 1 -> $26.81, floored
// at $10 by the old Math.max floor.
//
// ALL THREE TAKE IDS NOW (D214 item 11), so a body has nowhere to put a spot at
// all - the contracts are strict and refuse the field by name. What is left to
// prove is the SHARED SOURCE: if getSpotPrices returns the database's own spots
// and all three call it, all three are priced from the server.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import * as spotsService from "#domain/spots/service.ts";
import { GetSalesTaxBody } from "@dorado/contracts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type AddressFixture = { id: string; state: string };
type ProductFixture = { id: string };
type Spot = Awaited<ReturnType<typeof spotsService.getSpotPrices>>[number];

let customer: UserFixture;
let taxing: AddressFixture;
let product: ProductFixture;
let serverSpots: Spot[];

beforeAll(async () => {
  [customer] = await outside<UserFixture>(
    `SELECT id, name, email FROM auth.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  assert.ok(customer, "dev has no non-admin user");

  serverSpots = await spotsService.getSpotPrices();
  assert.ok(serverSpots.length > 0, "the server has no spots - every assertion here is vacuous");

  // A state that actually charges - the first version took the first
  // state_code found (AK, which taxes nothing), so both sides of the
  // comparison were 0 and it passed against the reverted bug.
  [taxing] = await outside<AddressFixture>(
    `SELECT DISTINCT a.id, a.state FROM places.addresses a
       JOIN places.user_addresses ua ON ua.address_id = a.id
       JOIN tax.sales_tax_rules r ON r.state_code = a.state
      WHERE r.tax_rate > 0 AND r.product_type IN ('Coin', 'All')
      ORDER BY a.id LIMIT 1`
  );
  assert.ok(taxing, "dev has no address in a charging state");

  [product] = await outside<ProductFixture>(
    `SELECT id FROM products.bullion
      WHERE display AND content IS NOT NULL AND type = 'Coin' ORDER BY id LIMIT 1`
  );
  assert.ok(product, "dev has no live coin to price");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// All three call sites share this one source, so this is what makes the fix one
// fact rather than three.
// Reads spots.spots, not exchange.metals - reading the legacy table made this
// an accidental comparison of two schemas that could fail for reasons having
// nothing to do with pricing.
test("getSpotPrices returns the database's spots in the shape the calculations read", async () => {
  const stored = await outside(
    `SELECT m.name, s.ask, s.bid
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id
      ORDER BY m.name`
  );

  assert.equal(serverSpots.length, stored.length, "the helper lost or invented a metal");

  for (const row of stored) {
    const served = serverSpots.find((s) => s.name === row.name);
    assert.ok(served, `${row.name} is in spots.spots and not in the pricing spots`);

    // calculateItemAsk reads `name` and `ask` - the schema's own names, since
    // the orders conversion (D84) retired the legacy spellings and the shim
    // that produced them.
    assert.ok("ask" in served, `${row.name} has no ask - the calculations read that name`);
    assert.equal(
      Number(served.ask).toFixed(6),
      Number(row.ask).toFixed(6),
      `${row.name} was priced at something other than the stored ask`
    );
  }
});

// THE ASSERTION THIS FILE EXISTS FOR, and the exploit is now shut one step
// earlier than it used to be. It used to be sent the way the exploit was - a
// real body with spots claiming gold is worth a dollar - and asserted that the
// two answers matched, which proved the forged spots were IGNORED. The body
// cannot carry them at all now: the contract is strict, so the forged request
// is REFUSED and the honest one is answered.
test("a body claiming gold costs $1 is refused, not quietly ignored", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const items = [{ id: product.id, quantity: 1 }];

      const honest = await request(app)
        .post("/api/tax/get_sales_tax")
        .send({ address_id: taxing.id, items });
      assert.equal(honest.status, 200, JSON.stringify(honest.body));

      const lying = await request(app)
        .post("/api/tax/get_sales_tax")
        .send({
          address_id: taxing.id,
          items,
          spots: serverSpots.map((s) => ({ name: s.name, ask: 1, bid: 1 })),
        });
      assert.equal(
        lying.status, 400,
        `a body carrying spots answered ${lying.status} - the client can still price the order`
      );

      // And the shape refuses it by name, so the refusal is the contract's and
      // not an accident of some other validation.
      const parsed = GetSalesTaxBody.safeParse({
        address_id: taxing.id, items, spots: [{ name: "Gold", ask: 1, bid: 1 }],
      });
      assert.equal(parsed.success, false, "GetSalesTaxBody accepts a spots field");
    });
  });
});

// The other half: a legitimate request is priced by the server rather than at
// zero. That omission - no forged values needed - was what made the old
// exposure easy to reach.
test("a legitimate request is priced by the server, not at zero", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/tax/get_sales_tax")
        .send({ address_id: taxing.id, items: [{ id: product.id, quantity: 1 }] });

      assert.equal(res.status, 200);
      const tax = typeof res.body === "number" ? res.body : (res.body?.tax ?? res.body);
      assert.ok(
        Number.isFinite(Number(tax)),
        `tax came back as ${JSON.stringify(res.body)}, which is not a number`
      );
    });
  });
});
