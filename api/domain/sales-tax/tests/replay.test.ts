// The sales tax endpoint, over real HTTP - one route, requireUser, and it
// computes money from an address and some products.
//
// IDS IN (D214 item 11). The body used to BE the items: a caller sent a
// product's purity, weight, tender flags and price, which are exactly the facts
// a tax rule matches on, and so exactly the way to choose the rate you are
// charged. It names an address and product ids now, and every fact is read
// from their own rows.
//
// A SILENT ZERO IS THE FAILURE THAT MATTERS - it looks identical whether a bad
// request undercharges an order or a state genuinely does not collect. So the
// malformed cases must be REFUSED, not answered with 0.
// NOTHING IS COMMITTED (pinned-pool.ts).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress, aProduct } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type AddressFixture = { id: string; state: string };
type ProductFixture = { id: string };

const customer: UserFixture = TEST_CUSTOMER;
// TWO STATES AND A COIN, NAMED AND BUILT (lane 1). The addresses used to be
// found by joining places.addresses to tax.sales_tax_rules - a taxing one and
// an untaxed one - which made every assertion here a fact about which
// customers happen to live where, and the version before it took the first
// state_code it saw (AK, which taxes nothing), so both sides of the comparison
// were 0.
//
// California charges 7.25% on Coin and ALASKA CHARGES NOTHING; both are
// literals of the tax seed, not of the address book.
const TAXING_STATE = "CA";
const UNTAXED_STATE = "AK";

const fixtures = async (c: PoolClient) => {
  const owner = await aUser(c);
  const taxing = await anAddress(c, owner, { state: TAXING_STATE, city: "Fresno", zip: "93701" });
  const untaxed = await anAddress(
    c, owner, { state: UNTAXED_STATE, city: "Juneau", zip: "99801", default_shipping: false }
  );
  const coin = await aProduct(c, { type: "Coin", display: true, content: 1 });
  return {
    taxing: { id: taxing.id, state: taxing.state },
    untaxed: { id: untaxed.id, state: untaxed.state },
    product: { id: coin.id },
  };
};

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// The product is an ARGUMENT now, not a module-scope fixture: it is built
// inside each transaction, so a request body naming it has to be built there
// too.
const body = (address_id: string | null, product: { id: string }) => ({
  address_id,
  items: [{ id: product.id, quantity: 1 }],
});

const taxOf = (res: { body: unknown }) =>
  Number(typeof res.body === "number" ? res.body : ((res.body as { tax?: unknown })?.tax ?? res.body));

test("an anonymous caller is refused", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { taxing, untaxed, product } = await fixtures(c);
    await anonymous(async () => {
      const res = await request(app).post("/api/tax/get_sales_tax").send(body(taxing.id, product));
      assert.ok([401, 403].includes(res.status), `answered ${res.status} anonymously`);
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

test("a signed-in customer gets a number back for a real state", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { taxing, untaxed, product } = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app).post("/api/tax/get_sales_tax").send(body(taxing.id, product));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(
        Number.isFinite(taxOf(res)),
        `sales tax came back as ${JSON.stringify(res.body)}, which is not a number - ` +
          `a NaN here becomes a NaN total on a real order`
      );
      assert.ok(taxOf(res) >= 0, "sales tax came back negative");
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

// THE ASSERTION THIS FILE'S OLD "RECORDED: no spots is zero tax" TEST SAID TO
// INVERT once the server sourced its own spots. It does: there is no `spots`
// field to omit, and a body carrying one is refused rather than believed.
test("the body cannot carry spots, prices or product facts at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { taxing, untaxed, product } = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const poisons = [
        { name: "spots", extra: { spots: [{ name: "Gold", ask: 1, bid: 1 }] } },
        { name: "an inline item document", extra: {
          items: [{ id: product.id, quantity: 1, purity: 0.1, content: 9999, price: 1 }],
        } },
        { name: "a state instead of an address", extra: { address: { state: "FL" } } },
      ];
      for (const { name, extra } of poisons) {
        const res = await request(app)
          .post("/api/tax/get_sales_tax")
          .send({ ...body(taxing.id, product), ...extra });
        assert.equal(res.status, 400, `${name} was accepted (${res.status})`);
      }
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

// The genuinely malformed cases, where there is no coherent answer at all. A
// zero would be indistinguishable from a state that does not collect.
test("a body with no items is refused rather than answered with a tax figure", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { taxing, untaxed, product } = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const noItems = await request(app)
        .post("/api/tax/get_sales_tax").send({ address_id: taxing.id, items: [] });
      assert.equal(noItems.status, 400, `no items answered ${noItems.status}`);

      // An address id that names nothing is a 404, not a silent tax-free quote.
      const noSuchAddress = await request(app)
        .post("/api/tax/get_sales_tax")
        .send(body("00000000-0000-4000-8000-000000000000", product));
      assert.equal(noSuchAddress.status, 404, `an unknown address answered ${noSuchAddress.status}`);
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

// No address at all is a real question - a quote asked before one is chosen -
// and the answer is no tax, which is CORRECT. That is exactly why the refusals
// above exist to distinguish it from a malformed request.
test("no address is answered with no tax, not an error", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { taxing, untaxed, product } = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app).post("/api/tax/get_sales_tax").send(body(null, product));
      assert.equal(res.status, 200, `a stateless quote answered ${res.status}`);
      assert.equal(taxOf(res), 0, "a quote with no address was charged tax");

      // And a state with no charging rule is likewise zero, through the same
      // door: a real address, no rule, no tax.
      const noRule = await request(app).post("/api/tax/get_sales_tax").send(body(untaxed.id, product));
      assert.equal(noRule.status, 200, `${untaxed.state} answered ${noRule.status}`);
      assert.equal(taxOf(noRule), 0, `${untaxed.state} has no charging rule and was taxed`);
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});
