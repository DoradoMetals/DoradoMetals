// The price of metal comes from the server, not from the request.
//
// Every money figure on an order is content * (spot.ask_spot * ask_premium), so
// whatever supplies `spots` decides what a customer pays. It used to be the
// REQUEST BODY, in three places - get_sales_tax, createSalesOrder and
// updatePaymentIntent - and in the last of those the result becomes the amount
// Stripe is told to charge. Measured before the fix, same order, same
// server-fetched items, only the body's spots differing:
//
//   ask_spot 3400 (honest)  ->  $3,673.53
//   ask_spot 1              ->     $26.81
//
// An ounce of gold for $26.81, floored at $10.00 by Math.max(rawAmount, 1000).
//
// WHAT THIS FILE ASSERTS, and what it cannot. The tax endpoint is the one of
// the three that can be driven end to end without Stripe, so it is the one
// tested over HTTP: send a body carrying absurd spots and confirm the answer is
// the server's. createSalesOrder and updatePaymentIntent take their spots from
// the same getPricingSpots() call, and updatePaymentIntent cannot be exercised
// here because it ends at Stripe - that belongs in the sandbox suite.
//
// So the second test asserts the shared source directly: getPricingSpots
// returns what the database holds, in the shape the calculations read. If that
// holds and all three call it, all three are priced from the server.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import * as spotsService from "#features/spots/service.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

await mockSessions();
const { default: app } = await import("#app");

let customer;
let serverSpots;
let nexusState;
let aggregateMax;

before(async () => {
  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user");

  serverSpots = await spotsService.getPricingSpots();
  assert.ok(serverSpots.length > 0, "the server has no spots - every assertion here is vacuous");

  // A state that actually CHARGES, and a rule whose band the fixture can sit
  // inside. The first version took the first state_code it found - AK, which
  // taxes nothing - so both halves of the comparison returned 0 and the test
  // passed against the reverted code. A fixture that cannot tell the two apart
  // is worse than no fixture.
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

// THE SHARED SOURCE. All three call sites use this, so this is what makes the
// fix one fact rather than three.
// THE FIXTURE READS THE TABLE getPricingSpots READS, WHICH IS NO LONGER
// exchange. Same change, and the same reason, as features/spots/replay.test.js -
// see the long note there. Reading exchange.metals here made this a comparison
// of two schemas by accident, and it failed the moment they drifted apart for a
// reason that had nothing to do with pricing.
test("getPricingSpots returns the database's spots in the shape the calculations read", async () => {
  const stored = await outside(
    `SELECT m.name AS type, s.ask AS ask_spot, s.bid AS bid_spot
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id
      ORDER BY m.name`
  );

  assert.equal(serverSpots.length, stored.length, "the helper lost or invented a metal");

  for (const row of stored) {
    const served = serverSpots.find((s) => s.type === row.type);
    assert.ok(served, `${row.type} is in spots.spots and not in the pricing spots`);

    // calculateItemAsk reads `type` and `ask_spot` - the legacy names. The repo
    // returns `name` and `ask`. If this ever fails with the value present under
    // a different key, the calculations have moved to the new shape and
    // getPricingSpots is the one place to update.
    assert.ok("ask_spot" in served, `${row.type} has no ask_spot - the calculations read that name`);
    assert.equal(
      Number(served.ask_spot).toFixed(6),
      Number(row.ask_spot).toFixed(6),
      `${row.type} was priced at something other than the stored ask`
    );
  }
});

// THE ASSERTION THIS FILE EXISTS FOR. Sent the way the exploit was: a real
// order body, with spots claiming gold is worth a dollar.
//
// The item is sized so BOTH prices fall inside the taxed band, which is what
// makes the two answers differ rather than both collapsing to zero. Priced at
// the server's gold it is worth a couple of hundred dollars; priced at the
// forged $1 it is worth pennies. Same rule, same rate, different base.
test("a body claiming gold costs $1 does not change the tax", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const gold = serverSpots.find((s) => s.type === "Gold") ?? serverSpots[0];
      // Small enough that the server's own price stays under the band's
      // aggregate ceiling - otherwise the honest call falls outside the rule
      // and returns zero for a legitimate reason.
      const content = (aggregateMax * 0.5) / Number(gold.ask_spot);

      // EVERY FIELD THE RULE MATCHES ON, not just the ones the calculation
      // reads. getSalesTax filters on purity, gross weight, domestic tender and
      // legal tender as well as price and aggregate - so an item missing any of
      // them matches no rule and is taxed at zero, which looks exactly like a
      // state that does not collect. That is how the first fixture here passed
      // against the bug.
      const items = [
        {
          type: "bullion",
          quantity: 1,
          metal_type: gold.type,
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
          spots: serverSpots.map((s) => ({ ...s, ask_spot: 1, bid_spot: 1 })),
        });

      assert.equal(honest.status, 200);
      assert.equal(lying.status, 200);

      const value = (res) =>
        Number(typeof res.body === "number" ? res.body : (res.body?.tax ?? res.body));

      // THE FIXTURE MUST NOT BE VACUOUS. If the honest call is untaxed then
      // both sides are zero and the comparison below proves nothing - which is
      // exactly how the first version of this test passed against the bug.
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

// And the same body with NO spots at all must not price at zero, which is what
// it used to do. That case is the one that made the exposure easy to reach: it
// needed no forged values, only an omission.
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
              metal_type: serverSpots[0].type,
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
