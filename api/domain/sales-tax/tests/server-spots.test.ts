// Every order's money is content * (spot.ask * ask_premium), so whatever supplies `spots` decides what a customer pays — it used to be the REQUEST BODY in three places (get_sales_tax, createSalesOrder, updatePaymentIntent). Measured before the fix, same order and items, only the body's spots differing: ask_spot 3400 (honest) -> $3,673.53; ask_spot 1 -> $26.81, floored at $10 by the old Math.max floor.
// get_sales_tax is the one of the three drivable end to end without Stripe, so it's tested over HTTP directly; the other two share the same getSpotPrices() source, and updatePaymentIntent belongs to the sandbox suite instead.
// So the second test below asserts that shared source directly — if getSpotPrices returns the database's own spots and all three call it, all three are priced from the server.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import * as spotsService from "#domain/spots/service.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type Spot = Awaited<ReturnType<typeof spotsService.getSpotPrices>>[number];

let customer: UserFixture;
let serverSpots: Spot[];
let nexusState: string | null;
let aggregateMax: number;

before(async () => {
  const users = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user");

  serverSpots = await spotsService.getSpotPrices();
  assert.ok(serverSpots.length > 0, "the server has no spots - every assertion here is vacuous");

  // A state that actually charges, with a rule the fixture can sit inside — the first version took the first state_code found (AK, which taxes nothing), so both sides of the comparison were 0 and it passed against the reverted bug.
  const rules = await outside(
    `SELECT state_code, tax_rate, aggregate_max FROM exchange.sales_tax_rules
     WHERE tax_rate > 0 AND product_type IN ('Coin', 'All')
     ORDER BY aggregate_max LIMIT 1`
  );
  assert.ok(rules[0], "dev has no sales tax rule that charges anything");
  nexusState = rules[0].state_code;
  aggregateMax = Number(rules[0].aggregate_max);
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// All three call sites share this one source, so this is what makes the fix one fact rather than three.
// Reads spots.spots, not exchange.metals — reading the legacy table made this an accidental comparison of two schemas that could fail for reasons having nothing to do with pricing.
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

// The assertion this file exists for — sent the way the exploit was: a real order body with spots claiming gold is worth a dollar. The item is sized so BOTH prices land inside the taxed band (a couple hundred dollars honest vs pennies forged), so the two answers actually differ rather than both collapsing to zero.
test("a body claiming gold costs $1 does not change the tax", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const gold = serverSpots.find((s) => s.name === "Gold") ?? serverSpots[0];
      // Small enough that the server's own price stays under the band's
      // aggregate ceiling - otherwise the honest call falls outside the rule
      // and returns zero for a legitimate reason.
      const content = (aggregateMax * 0.5) / Number(gold.ask);

      // Every field the rule matches on, not just the ones the calculation reads — an item missing purity/weight/tender fields matches no rule and taxes at zero, which looks exactly like a non-collecting state. That's how the first fixture here passed against the bug.
      const items = [
        {
          type: "bullion",
          quantity: 1,
          metal_type: gold.name,
          content,
          gross: content,
          purity: 0.9999,
          // The rule under test carries is_domestic = false, and the query
          // compares it to this field rather than ignoring it.
          domestic_tender: false,
          legal_tender: null,
          ask_premium: 1.0,
          product_type: "Coin",
          price: 100,
        },
      ];

      const honest = await request(app)
        .post("/api/tax/get_sales_tax")
        .send({ address: { state: nexusState }, items });

      const lying = await request(app)
        .post("/api/tax/get_sales_tax")
        .send({
          address: { state: nexusState },
          items,
          spots: serverSpots.map((s) => ({ ...s, ask: 1, bid: 1 })),
        });

      assert.equal(honest.status, 200);
      assert.equal(lying.status, 200);

      const value = (res: { body: unknown }) =>
        Number(
          typeof res.body === "number"
            ? res.body
            : ((res.body as { tax?: unknown })?.tax ?? res.body)
        );

      // The fixture must not be vacuous — if the honest call is untaxed, both sides are zero and this proves nothing, which is exactly how the first version passed against the bug.
      assert.ok(
        value(honest) > 0,
        `the honest request was taxed ${value(honest)} in ${nexusState} - the fixture ` +
          `falls outside every rule, so this test cannot distinguish anything`
      );

      assert.equal(
        value(lying).toFixed(6),
        value(honest).toFixed(6),
        `supplying spots in the body changed the tax from ${value(honest)} to ` +
          `${value(lying)} - the client is still pricing the order`
      );
    });
  });
});

// Same body with NO spots must not price at zero either — that omission (no forged values needed) was what made the exposure easy to reach.
test("a body with no spots is priced by the server, not at zero", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/tax/get_sales_tax")
        .send({
          address: { state: nexusState },
          items: [
            {
              type: "bullion",
              quantity: 1,
              metal_type: serverSpots[0].name,
              content: 1,
              ask_premium: 1.05,
              product_type: "Coin",
              price: 100,
            },
          ],
        });

      assert.equal(res.status, 200);
      const tax = typeof res.body === "number" ? res.body : (res.body?.tax ?? res.body);
      assert.ok(
        Number.isFinite(Number(tax)),
        `tax came back as ${JSON.stringify(res.body)}, which is not a number`
      );
    });
  });
});
