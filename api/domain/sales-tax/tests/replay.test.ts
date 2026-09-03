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
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type AddressFixture = { id: string; state: string };
type ProductFixture = { id: string };

let customer: UserFixture;
let taxing: AddressFixture;
let untaxed: AddressFixture;
let product: ProductFixture;

beforeAll(async () => {
  [customer] = await outside<UserFixture>(
    `SELECT id, name, email FROM auth.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  assert.ok(customer, "dev has no non-admin user");

  // An address in a state that actually charges - AK has rules and taxes
  // nothing, so picking the first state_code found would compare 0 with 0.
  [taxing] = await outside<AddressFixture>(
    `SELECT DISTINCT a.id, a.state FROM places.addresses a
       JOIN places.user_addresses ua ON ua.address_id = a.id
       JOIN tax.sales_tax_rules r ON r.state_code = a.state
      WHERE r.tax_rate > 0 AND r.product_type IN ('Coin', 'All')
      ORDER BY a.id LIMIT 1`
  );
  assert.ok(taxing, "dev has no book address in a charging state - these tests would prove nothing");

  [untaxed] = await outside<AddressFixture>(
    `SELECT DISTINCT a.id, a.state FROM places.addresses a
       JOIN places.user_addresses ua ON ua.address_id = a.id
      WHERE NOT EXISTS (
        SELECT 1 FROM tax.sales_tax_rules r WHERE r.state_code = a.state AND r.tax_rate > 0)
      ORDER BY a.id LIMIT 1`
  );
  assert.ok(untaxed, "dev has no address in a state with no charging rule");

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

const body = (address_id: string | null) => ({
  address_id,
  items: [{ id: product.id, quantity: 1 }],
});

const taxOf = (res: { body: unknown }) =>
  Number(typeof res.body === "number" ? res.body : ((res.body as { tax?: unknown })?.tax ?? res.body));

test("an anonymous caller is refused", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).post("/api/tax/get_sales_tax").send(body(taxing.id));
      assert.ok([401, 403].includes(res.status), `answered ${res.status} anonymously`);
    });
  });
});

test("a signed-in customer gets a number back for a real state", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app).post("/api/tax/get_sales_tax").send(body(taxing.id));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(
        Number.isFinite(taxOf(res)),
        `sales tax came back as ${JSON.stringify(res.body)}, which is not a number - ` +
          `a NaN here becomes a NaN total on a real order`
      );
      assert.ok(taxOf(res) >= 0, "sales tax came back negative");
    });
  });
});

// THE ASSERTION THIS FILE'S OLD "RECORDED: no spots is zero tax" TEST SAID TO
// INVERT once the server sourced its own spots. It does: there is no `spots`
// field to omit, and a body carrying one is refused rather than believed.
test("the body cannot carry spots, prices or product facts at all", async () => {
  await inPinnedTransaction(async () => {
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
          .send({ ...body(taxing.id), ...extra });
        assert.equal(res.status, 400, `${name} was accepted (${res.status})`);
      }
    });
  });
});

// The genuinely malformed cases, where there is no coherent answer at all. A
// zero would be indistinguishable from a state that does not collect.
test("a body with no items is refused rather than answered with a tax figure", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const noItems = await request(app)
        .post("/api/tax/get_sales_tax").send({ address_id: taxing.id, items: [] });
      assert.equal(noItems.status, 400, `no items answered ${noItems.status}`);

      // An address id that names nothing is a 404, not a silent tax-free quote.
      const noSuchAddress = await request(app)
        .post("/api/tax/get_sales_tax")
        .send(body("00000000-0000-4000-8000-000000000000"));
      assert.equal(noSuchAddress.status, 404, `an unknown address answered ${noSuchAddress.status}`);
    });
  });
});

// No address at all is a real question - a quote asked before one is chosen -
// and the answer is no tax, which is CORRECT. That is exactly why the refusals
// above exist to distinguish it from a malformed request.
test("no address is answered with no tax, not an error", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app).post("/api/tax/get_sales_tax").send(body(null));
      assert.equal(res.status, 200, `a stateless quote answered ${res.status}`);
      assert.equal(taxOf(res), 0, "a quote with no address was charged tax");

      // And a state with no charging rule is likewise zero, through the same
      // door: a real address, no rule, no tax.
      const noRule = await request(app).post("/api/tax/get_sales_tax").send(body(untaxed.id));
      assert.equal(noRule.status, 200, `${untaxed.state} answered ${noRule.status}`);
      assert.equal(taxOf(noRule), 0, `${untaxed.state} has no charging rule and was taxed`);
    });
  });
});
