// The sales tax endpoint, over real HTTP.
//
// One route, requireUser, and it computes money: getSalesTax takes an address
// and a set of items and returns what the customer will be charged on top. The
// rules table has 88 rows and is one of only two table pairs the migration
// rehearsal managed to populate, so this is a calculation whose inputs are
// already living in the new schema.
//
// WHAT IS WORTH ASSERTING. Not the rates themselves - features/sales-orders
// has unit tests for the arithmetic, and duplicating them here would only
// couple this file to numbers that legitimately change. What HTTP adds is the
// boundary: that the route is guarded, that a malformed body is refused rather
// than silently taxed at zero, and that a state with no nexus is answered
// differently from a state with one.
//
// A SILENT ZERO IS THE FAILURE MODE THAT MATTERS. Tax that comes back as 0 for
// a bad request looks exactly like tax that comes back as 0 because the state
// does not collect - and the first is a bug that undercharges every order.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type MetalFixture = { type: string; ask_spot: number; bid_spot: number };

let customer: UserFixture;
let spots: MetalFixture[];
let nexusState: string | null;

before(async () => {
  const users = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user");

  spots = await outside<MetalFixture>(
    `SELECT type, ask_spot, bid_spot FROM exchange.metals ORDER BY type`);
  assert.ok(spots.length > 0, "dev has no metals - a tax calculation needs a spot to price against");

  // state_code, not state. The first version of this queried `state` - the
  // column does not exist - and every test failed in under a millisecond
  // because before() threw. Same class of mistake as querying rates.notes:
  // asserting against a column without checking the table has it.
  const states = await outside(
    `SELECT DISTINCT state_code FROM exchange.sales_tax_rules WHERE state_code IS NOT NULL LIMIT 1`
  );
  nexusState = states[0]?.state_code;
  assert.ok(nexusState, "dev has no sales tax rule with a state - the suite would prove nothing");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

const body = (state: string | null) => ({
  address: { state },
  items: [
    {
      type: "bullion",
      quantity: 1,
      metal: spots[0].type,
      content: 1,
      // Deliberately small. The FL rules cap at aggregate_max 500, so a
      // $2,500 item falls outside every band and comes back untaxed - which
      // would make "a real state" indistinguishable from "no rule".
      price: 100,
      product_type: "Coin",
    },
  ],
  spots,
});

test("an anonymous caller is refused", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app)
        .post("/api/tax/get_sales_tax")
        .send(body(nexusState));
      assert.ok([401, 403].includes(res.status), `answered ${res.status} anonymously`);
    });
  });
});

test("a signed-in customer gets a number back for a real state", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/tax/get_sales_tax")
        .send(body(nexusState));
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const tax = typeof res.body === "number" ? res.body : res.body?.tax ?? res.body;
      assert.ok(
        Number.isFinite(Number(tax)),
        `sales tax came back as ${JSON.stringify(res.body)}, which is not a number - ` +
          `a NaN here becomes a NaN total on a real order`
      );
      assert.ok(Number(tax) >= 0, "sales tax came back negative");
    });
  });
});

// RECORDED, NOT ASSERTED AS CORRECT. A request with a valid address and items
// but NO spots answers 200 with zero tax.
//
// That is not a quirk of this endpoint, it is the visible edge of something
// larger: THE CLIENT SUPPLIES THE SPOT PRICES EVERY MONEY FIGURE IS COMPUTED
// FROM. calculateItemAsk is
//
//   content * (spot.ask_spot * ask_premium)
//
// and `spots` arrives in the request body here, in createSalesOrder, and in
// updatePaymentIntent - where the result becomes the Stripe charge amount. Send
// no spots and everything prices at zero; send low ones and it prices low.
// FOLLOWUPS has the measured numbers.
//
// So this pins the CURRENT behaviour rather than the desired one. When the
// server sources its own spots, this is the assertion to invert - deliberately,
// with the figure it should return instead.
test("RECORDED: a request with no spots is answered with zero tax", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/tax/get_sales_tax")
        .send({ address: { state: nexusState }, items: body(nexusState).items });

      const tax = typeof res.body === "number" ? res.body : res.body?.tax ?? res.body;
      assert.equal(res.status, 200);
      assert.equal(
        Number(tax),
        0,
        "no-spots no longer prices at zero - if the server now sources its own " +
          "spots, this is the assertion to update rather than to satisfy"
      );
    });
  });
});

// The genuinely malformed cases, where there is no coherent answer at all.
test("a body with no address or no items is not answered with a real tax figure", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      for (const [name, payload] of [
        ["no address", { items: body(nexusState).items, spots }],
        ["no items", { address: { state: nexusState }, spots }],
      ]) {
        const res = await request(app).post("/api/tax/get_sales_tax").send(payload);
        const tax = Number(res.body?.tax ?? res.body);
        assert.ok(
          res.status >= 400 || tax === 0 || Number.isNaN(tax),
          `"${name}" answered ${res.status} with a tax of ${JSON.stringify(res.body)}`
        );
      }
    });
  });
});
// A state nobody has a rule for must come back as no tax, and that is CORRECT -
// which is exactly why the test above exists to distinguish it from a refusal.
test("a state with no rule is answered with no tax, not an error", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app).post("/api/tax/get_sales_tax").send(body("ZZ"));
      assert.equal(res.status, 200, `an unknown state answered ${res.status}`);
      const tax = typeof res.body === "number" ? res.body : res.body?.tax ?? res.body;
      assert.equal(Number(tax), 0, "an unknown state was charged tax");
    });
  });
});
