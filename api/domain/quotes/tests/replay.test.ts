// The quote endpoints, over real HTTP — pins that every number is priced by the server from its own tables, and a body riding prices/spots changes NOTHING (the $26.81 regression stays dead). Math checks are hand-computed from the same tables the endpoints read, so a transposed spot or doubled quantity fails loudly.
// Everything runs inside the pin — the endpoints only read, but so did tracking.test.js until it didn't; no lock, since quotes write nothing.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { aUser, anOrder, anAddress } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

const CENTS = 0.005; // money reconciliation tolerance: within half a cent
const EXACT = 1e-9;  // same floats, same tables, same order of operations

// SELECT projections, not table rows.
type SpotFixture = { name: string; ask: number; bid: number };
type ProductFixture = {
  id: string;
  name: string;
  content: number;
  ask_premium: number;
  bid_premium: number;
  metal: string;
};
type BuyerFixture = {
  id: string;
  name: string | null;
  email: string | null;
  dorado_funds: number | null;
};

let spots: SpotFixture[];      // per metal, from the tables the API reads
let gold: SpotFixture; // the Gold spot row
let product: ProductFixture;   // a Gold product live in BOTH directions
let hiddenAsk: { id: string }; // display = false - the sell side has no gate (ruling 49) and quotes it anyway
let buyer: BuyerFixture;       // a real user - the address it needs is built per-test
let goldId: string;            // the Gold metal's id - a scrap line names it
let standardId: string;        // shipping.services, code STANDARD
let cardId: string;            // payments.methods, sale, type CARD

beforeAll(async () => {
  spots = await outside<SpotFixture>(
    `SELECT m.name, s.ask, s.bid
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id`
  );
  // Two claims, separated — `gold?.ask > 0` conflated 'no Gold row' with 'Gold priced at zero' since `undefined > 0` is also false; now distinct failures.
  const found = spots.find((s) => s.name === "Gold");
  assert.ok(found, "dev has no Gold spot row - every check here would be vacuous");
  assert.ok(
    found.ask > 0 && found.bid > 0,
    "dev's Gold spot is not priced - every check here would be vacuous"
  );
  gold = found;

  const [goldRow] = await outside<{ id: string }>(
    `SELECT id FROM metals.metals WHERE name = 'Gold' LIMIT 1`
  );
  assert.ok(goldRow, "dev has no Gold metal row - a scrap line names it by id");
  goldId = goldRow.id;

  const products = await outside<ProductFixture>(
    `SELECT b.id, b.name, b.content, b.ask_premium, b.bid_premium, m.name AS metal
       FROM products.bullion b JOIN metals.metals m ON m.id = b.metal_id
      WHERE b.display AND b.content IS NOT NULL
        AND b.ask_premium IS NOT NULL AND b.bid_premium IS NOT NULL
        AND m.name = 'Gold'
      ORDER BY b.name LIMIT 1`
  );
  product = products[0];
  assert.ok(product, "dev has no gold product live in both directions");

  const hiddens = await outside<{ id: string }>(
    `SELECT id FROM products.bullion WHERE NOT display LIMIT 1`
  );
  hiddenAsk = hiddens[0];
  assert.ok(hiddenAsk, "dev has no display=false product");

  // Identity only - auth.users, the live table. The address a sales-order
  // quote needs is built fresh inside each test that needs one (see
  // anAddress below): discovering an EXISTING places.addresses row here and
  // using it later, across the gap to the test body, was flaky - other
  // files in the suite build and (a few, deliberately) commit real rows
  // there, so a row found in beforeAll could be gone by the time a test
  // read it a moment later. Unlike exchange.addresses, places.addresses is
  // not frozen.
  const buyers = await outside<BuyerFixture>(
    `SELECT id, name, email, dorado_funds FROM auth.users
      ORDER BY dorado_funds DESC NULLS LAST, id LIMIT 1`
  );
  buyer = buyers[0];
  assert.ok(buyer, "dev has no user to buy as");

  // The delivery service and payment method are IDS in the body now (D214
  // item 11); their rows' `code` and `type` are what price the order.
  const [standard] = await outside<{ id: string }>(
    `SELECT id FROM shipping.services WHERE code = 'STANDARD' ORDER BY id LIMIT 1`
  );
  assert.ok(standard, "dev has no STANDARD shipping service - the charge check would be vacuous");
  standardId = standard.id;

  const [card] = await outside<{ id: string }>(
    `SELECT id FROM payments.methods WHERE direction = 'sale' AND type = 'CARD' LIMIT 1`
  );
  assert.ok(card, "dev has no CARD sale method - the surcharge check would be vacuous");
  cardId = card.id;
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// ---------------------------------------------------------------- catalog

test("the catalogue quote is public and prices both sides at the server's spot", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const ask = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: product.id, quantity: 2 }], side: "ask" });
      assert.equal(ask.status, 200, `the public catalogue quote answered ${ask.status}: ${JSON.stringify(ask.body)}`);
      assert.equal(ask.body.side, "ask");
      assert.ok(!Number.isNaN(Date.parse(ask.body.spots_at)), "spots_at is not a timestamp");

      // content * (ask_spot * ask_premium), same tables, same association.
      const unit = product.content * (gold.ask * product.ask_premium);
      assert.ok(Math.abs(ask.body.items[0].unit_price - unit) < EXACT,
        `ask unit_price ${ask.body.items[0].unit_price} != hand-computed ${unit}`);
      assert.ok(Math.abs(ask.body.items[0].line_total - unit * 2) < EXACT, "line_total is not unit * quantity");
      assert.ok(Math.abs(ask.body.total - unit * 2) < EXACT, "total is not the sum of the lines");

      const bid = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: product.id }], side: "bid" });
      assert.equal(bid.status, 200);
      const bidUnit = product.content * (gold.bid * product.bid_premium);
      assert.ok(Math.abs(bid.body.items[0].unit_price - bidUnit) < EXACT,
        `bid unit_price ${bid.body.items[0].unit_price} != hand-computed ${bidUnit}`);
      // No quantity asks what one costs.
      assert.equal(bid.body.items[0].quantity, 1);
    });
  }, { actor: TEST_ACTOR.id });
});

test("a display=false product is refused on the ask side and quoted on the bid side", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const refused = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: hiddenAsk.id }], side: "ask" });
      // 422: the liveness gate is a RULE the service applies, and a domain
      // refusal is Invalid (D214 item 11). A malformed body would be 400.
      assert.equal(refused.status, 422, `a hidden product priced on the ask side (${refused.status})`);
      assert.match(refused.body?.error?.message ?? "", /not available/);

      // The same id on the bid side: the sell side has no gate at all
      // (Jacob, 2026-09-03, ruling 49), so a product hidden from buying is
      // still quoted for selling. The gate is per side, not per product.
      const quoted = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: hiddenAsk.id }], side: "bid" });
      assert.equal(quoted.status, 200, `a sell-live product was refused on the bid side (${quoted.status}): ${JSON.stringify(quoted.body)}`);
    });
  }, { actor: TEST_ACTOR.id });
});

// ------------------------------------------------------------- sales order

test("the sales-order quote needs a session; the two goods quotes do not", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      // Funds-priced, so guarded.
      const res = await request(app)
        .post("/api/quotes/sales_order")
        .send({ items: [{ id: product.id, quantity: 1 }] });
      assert.ok([401, 403].includes(res.status), `sales_order answered ${res.status} with no session`);

      // The purchase quote is public like the catalogue: an anonymous sell
      // cart estimates what the business would pay.
      const pub = await request(app)
        .post("/api/quotes/purchase_order")
        .send({ items: [{ type: "product", bullion_id: product.id, quantity: 1 }] });
      assert.equal(pub.status, 200, `purchase_order answered ${pub.status} anonymously`);
      assert.ok(pub.body.total > 0, "the anonymous estimate priced at nothing");
    });
  }, { actor: TEST_ACTOR.id });
});

test("the sales-order breakdown reconciles to the cent and funds come from the user's row", async () => {
  await inPinnedTransaction(async (c) => {
    // buyer is a REAL, pre-existing user, who may already own a
    // default-shipping address in dev - default_shipping: false avoids
    // the one-default-per-user constraint against that real row.
    const address = await anAddress(c, buyer, { default_shipping: false });
    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      const res = await request(app).post("/api/quotes/sales_order").send({
        items: [{ id: product.id, quantity: 2 }],
        address_id: address.id,
        carrier_service_id: standardId,
        payment_method_id: cardId,
      });
      assert.equal(res.status, 200, `the sales-order quote answered ${res.status}: ${JSON.stringify(res.body)}`);
      const b = res.body;

      for (const field of [
        "item_total", "base_total", "shipping_charge", "beginning_funds",
        "ending_funds", "pre_charges_amount", "subject_to_charges_amount",
        "post_charges_amount", "charges_amount", "sales_tax", "order_total",
      ]) {
        assert.ok(typeof b[field] === "number", `the breakdown is missing ${field}`);
      }

      // The item math, from the same tables.
      const unit = product.content * (gold.ask * product.ask_premium);
      assert.ok(Math.abs(b.items[0].unit_ask - unit) < EXACT, `unit_ask ${b.items[0].unit_ask} != ${unit}`);
      assert.ok(Math.abs(b.item_total - unit * 2) < EXACT, "item_total is not the sum of the lines");
      const lineSum = b.items.reduce((acc: number, i: { line_total: number }) => acc + i.line_total, 0);
      assert.ok(Math.abs(lineSum - b.item_total) < CENTS, "the lines do not sum to item_total");

      // The whole breakdown must reconcile: this is the arithmetic
      // calculateSalesOrderTotal commits an order under.
      assert.ok(Math.abs(b.item_total + b.shipping_charge + b.sales_tax - b.base_total) < CENTS,
        "base_total != item_total + shipping + tax");
      assert.ok(Math.abs(b.base_total - b.pre_charges_amount - b.subject_to_charges_amount) < CENTS,
        "funds applied + amount charged != base_total");
      assert.ok(Math.abs(b.post_charges_amount - b.subject_to_charges_amount - b.charges_amount) < CENTS,
        "post_charges != subject + surcharge");
      assert.ok(Math.abs(b.order_total - b.pre_charges_amount - b.post_charges_amount) < CENTS,
        "order_total != pre + post");

      // Funds come from the SESSION user's auth.users row - never the
      // body, and not from the mocked session object either (it carries no
      // dorado_funds at all, which is the point).
      assert.ok(Math.abs(b.beginning_funds - Number(buyer.dorado_funds ?? 0)) < EXACT,
        `beginning_funds ${b.beginning_funds} is not the user's row balance ${buyer.dorado_funds}`);
      const applied = Math.min(b.beginning_funds, b.base_total);
      assert.ok(Math.abs(b.ending_funds - (b.beginning_funds - applied)) < CENTS,
        "ending_funds is not beginning minus what was applied");
      assert.ok(Math.abs(b.pre_charges_amount - applied) < CENTS,
        "the customer's balance was not applied - credit applies whenever there is one");

      // CARD surcharges at 2.9% of what is left to charge.
      if (b.subject_to_charges_amount > 0) {
        assert.ok(Math.abs(b.charges_amount - b.subject_to_charges_amount * 0.029) < CENTS,
          "the CARD surcharge is not 2.9% of the charged amount");
      }
      // getShippingCharge: free over $1000, else STANDARD is $25.
      assert.equal(b.shipping_charge, b.item_total > 1000 ? 0 : 25);
    });
  }, { actor: TEST_ACTOR.id });
});

// Admin quotes price the named user's funds (subjectOf semantics); a customer naming somebody else just gets their OWN quote back — the guard is the session winning, never an error or somebody else's balance.
test("an admin's sales-order quote prices the named user's funds; a customer's name is ignored", async () => {
  await inPinnedTransaction(async () => {
    // A second user whose balance differs from the session user's - a
    // same-balance fixture would make both assertions vacuous.
    const targets = await outside(
      `SELECT id, dorado_funds FROM auth.users
        WHERE id <> $1 AND dorado_funds IS NOT NULL
          AND dorado_funds IS DISTINCT FROM $2
        ORDER BY dorado_funds DESC, id LIMIT 1`,
      [buyer.id, buyer.dorado_funds]
    );
    const target = targets[0];
    assert.ok(target, "dev has no second user with a different balance - the subject check would be vacuous");

    const body = { items: [{ id: product.id, quantity: 1 }], user_id: target.id };

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "admin" }, async () => {
      const res = await request(app).post("/api/quotes/sales_order").send(body);
      assert.equal(res.status, 200, `the admin quote answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(Math.abs(res.body.beginning_funds - Number(target.dorado_funds)) < EXACT,
        `an admin naming a user got beginning_funds ${res.body.beginning_funds}, not that user's row balance ${target.dorado_funds}`);
    });

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "user" }, async () => {
      const res = await request(app).post("/api/quotes/sales_order").send(body);
      assert.equal(res.status, 200, "the guard is the session winning, not an error");
      assert.ok(Math.abs(res.body.beginning_funds - Number(buyer.dorado_funds ?? 0)) < EXACT,
        `a customer naming somebody else got beginning_funds ${res.body.beginning_funds}, not their own ${buyer.dorado_funds}`);
    });
  }, { actor: TEST_ACTOR.id });
});

// ---------------------------------------------------------- purchase order

test("the purchase-order quote prices scrap and product lines from the rates band for the metal total", async () => {
  await inPinnedTransaction(async () => {
    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      // 124.414g at .500 purity = exactly 2 troy oz of content, derived by
      // the SERVER - the body carries no content field at all.
      const scrap = {
        type: "scrap", metal_id: goldId, pre_melt: 124.414, purity: 0.5, unit: "g",
      };
      const line = { type: "product", bullion_id: product.id, quantity: 2 };

      const res = await request(app).post("/api/quotes/purchase_order").send({ items: [scrap, line] });
      assert.equal(res.status, 200, `the purchase-order quote answered ${res.status}: ${JSON.stringify(res.body)}`);
      const [s, p] = res.body.items;

      const scrapContent = (124.414 / 31.1035) * 0.5;
      assert.ok(Math.abs(s.content - scrapContent) < EXACT, `derived scrap content ${s.content} != ${scrapContent}`);
      assert.equal(s.kind, "scrap");
      assert.equal(s.index, 0);
      assert.equal(p.kind, "product");
      assert.equal(p.index, 1);
      assert.equal(p.metal, "Gold");

      // The band is chosen on the metal's TOTAL content across the quote -
      // per line, the way intake.ts sums it - and read back from the same
      // table the endpoint read.
      const metalTotal = scrapContent + Number(product.content);
      const bands = await outside(
        `SELECT r.scrap_pct, r.bullion_pct
           FROM rates.rates r JOIN metals.metals m ON m.id = r.metal_id
          WHERE m.name = 'Gold' AND $1 >= r.min_qty
            AND (r.max_qty IS NULL OR $1 <= r.max_qty)
          ORDER BY r.min_qty LIMIT 1`,
        [metalTotal]
      );
      assert.ok(bands[0], "dev has no Gold rate band covering the total - the premium check would be vacuous");
      assert.equal(s.premium, Number(bands[0].scrap_pct), "scrap premium is not the band's scrap_pct");
      assert.equal(p.premium, Number(bands[0].bullion_pct), "product premium is not the band's bullion_pct");

      // content * (bid_spot * premium); scrap is never multiplied by
      // quantity, products are.
      const scrapUnit = scrapContent * (gold.bid * Number(bands[0].scrap_pct));
      const productUnit = Number(product.content) * (gold.bid * Number(bands[0].bullion_pct));
      assert.ok(Math.abs(s.unit_price - scrapUnit) < EXACT, `scrap unit ${s.unit_price} != ${scrapUnit}`);
      assert.ok(Math.abs(s.line_total - scrapUnit) < EXACT, "scrap line_total should not multiply by quantity");
      assert.ok(Math.abs(p.unit_price - productUnit) < EXACT, `product unit ${p.unit_price} != ${productUnit}`);
      assert.ok(Math.abs(p.line_total - productUnit * 2) < EXACT, "product line_total is not unit * quantity");

      assert.ok(Math.abs(res.body.total - (s.line_total + p.line_total)) < EXACT, "total is not the sum of the lines");
      // Declared value is capped by the insurance ceiling — this fixture's total (~$15,900) exceeds the $10,000 ceiling, so the clamp is actually REACHED here, not asserted vacuously. Read from the same table the endpoint reads.
      const ceiling = await outside(
        `SELECT min(s.max_insured_value) AS ceiling
           FROM shipping.services s
           JOIN organizations.organizations o ON o.id = (
                 SELECT c.organization_id FROM shipping.carriers c WHERE c.id = s.carrier_id)
          WHERE s.is_active AND lower(o.name) = 'fedex'`,
        []
      );
      const cap = Number(ceiling[0].ceiling);
      assert.ok(Number.isFinite(cap) && cap > 0, "no insurance ceiling is configured - the cap check would be vacuous");
      assert.equal(res.body.declared_value, Math.min(res.body.total, cap),
        "declared_value is the total capped at shipping.services.max_insured_value");

      // THE NAME LOOKUP IS GONE (D214 item 11): a product line names its
      // catalogue id, so the two spellings D73 had to resolve between - and the
      // `SELECT id FROM products.bullion WHERE name = ...` behind them - do not
      // exist. A body naming a product by name is refused by the contract.
      const byName = await request(app).post("/api/quotes/purchase_order").send({
        items: [{ type: "product", product_name: product.name, quantity: 2 }],
      });
      assert.equal(byName.status, 400, "a product named by name was accepted");
    });
  }, { actor: TEST_ACTOR.id });
});

// THE $26.81 REGRESSION, SHUT ONE STEP EARLIER. A body riding spots, prices or
// premiums used to be IGNORED - the quote read only ids and answered the same
// number either way. The contracts are strict now, so such a body is REFUSED
// rather than silently discarded, which is the stronger property: a field the
// schema has no place for cannot be read by accident later.
test("no body-supplied price, spot or premium is accepted at all", async () => {
  await inPinnedTransaction(async (c) => {
    // buyer is a REAL, pre-existing user, who may already own a
    // default-shipping address in dev - default_shipping: false avoids
    // the one-default-per-user constraint against that real row.
    const address = await anAddress(c, buyer, { default_shipping: false });
    const poison = {
      spots: [{ type: "Gold", name: "Gold", ask_spot: 1, bid_spot: 1, ask: 1, bid: 1 }],
      spot_prices: [{ type: "Gold", ask_spot: 1, bid_spot: 1 }],
      ask_spot: 1,
      bid_spot: 1,
      price: 0.01,
      total: 0.01,
    };

    await anonymous(async () => {
      const clean = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: product.id, quantity: 2 }], side: "ask" });
      assert.equal(clean.status, 200, JSON.stringify(clean.body));
      // The honest number is nowhere near the poisoned one it refuses.
      assert.ok(clean.body.items[0].unit_price > 1, "the clean quote itself is suspiciously tiny");

      const poisoned = await request(app).post("/api/quotes/catalog").send({
        ...poison,
        items: [{ id: product.id, quantity: 2, unit_price: 0.01, price: 0.01, ask_premium: 0 }],
        side: "ask",
      });
      assert.equal(poisoned.status, 400, "a catalogue quote accepted something price-shaped");

      // Each field on its own, so the refusal is not an accident of one of them.
      for (const field of ["unit_price", "price", "ask_premium", "content"]) {
        const one = await request(app).post("/api/quotes/catalog").send({
          items: [{ id: product.id, quantity: 2, [field]: 0.01 }], side: "ask",
        });
        assert.equal(one.status, 400, `a catalogue line carrying ${field} was accepted`);
      }
    });

    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      const base = {
        items: [{ id: product.id, quantity: 2 }],
        address_id: address.id,
        carrier_service_id: standardId,
        payment_method_id: cardId,
      };
      const clean = await request(app).post("/api/quotes/sales_order").send(base);
      assert.equal(clean.status, 200, JSON.stringify(clean.body));

      // `dorado_funds` and `user` were the way a caller declared the credit
      // balance they were discounted by. Neither is a field any more.
      for (const extra of [
        poison,
        { dorado_funds: 1000000 },
        { user: { dorado_funds: 1000000 } },
        { items: [{ id: product.id, quantity: 2, ask_premium: 0, price: 0.01 }] },
      ]) {
        const poisoned = await request(app)
          .post("/api/quotes/sales_order").send({ ...base, ...extra });
        assert.equal(
          poisoned.status, 400,
          `a sales-order quote accepted ${JSON.stringify(Object.keys(extra))}`
        );
      }

      const sellBase = {
        items: [
          { type: "scrap", metal_id: goldId, pre_melt: 124.414, purity: 0.5, unit: "g" },
          { type: "product", bullion_id: product.id, quantity: 1 },
        ],
      };
      const cleanSell = await request(app).post("/api/quotes/purchase_order").send(sellBase);
      assert.equal(cleanSell.status, 200, JSON.stringify(cleanSell.body));
      assert.ok(cleanSell.body.total > 1, "the clean sell quote itself is suspiciously tiny");

      // A scrap line carrying its own content is the customer declaring the
      // quantity of fine metal they are paid for; a product line carrying a
      // premium is the customer setting the rate.
      for (const items of [
        [{ type: "scrap", metal_id: goldId, pre_melt: 124.414, purity: 0.5, unit: "g", content: 9999 }],
        [{ type: "scrap", metal_id: goldId, pre_melt: 124.414, purity: 0.5, unit: "g", premium: 0.0001 }],
        [{ type: "product", bullion_id: product.id, quantity: 1, bid_premium: 0.0001 }],
        [{ type: "product", bullion_id: product.id, quantity: 1, content: 9999 }],
      ]) {
        const poisonedSell = await request(app)
          .post("/api/quotes/purchase_order").send({ ...poison, items });
        assert.equal(
          poisonedSell.status, 400,
          `a purchase-order quote accepted ${JSON.stringify(Object.keys(items[0]))}`
        );
      }
    });
  }, { actor: TEST_ACTOR.id });
});


// ------------------------------------------------- the profit breakdown

// ADMIN ONLY, and asserted from both sides: the response is the business's
// margins on a customer's order, so the customer being refused is as much the
// contract as the admin being answered. Priced against a purchase order built
// here - orderRead.view (what profitBreakdown reads) resolves from
// orders.orders, so discovering the fixture from exchange.purchase_orders was
// answering the question for a table the endpoint no longer queries.
test("the profit breakdown answers an admin and refuses everyone else", async () => {
  await inPinnedTransaction(async (c) => {
    const seller = await aUser(c);
    const order = await anOrder(c, seller, { direction: "purchase" })
      .withLots(1).withSpots().withTotals({ shipping: 24.5 });
    const order_id = order.id;

    await anonymous(async () => {
      const res = await request(app).post("/api/quotes/profit_breakdown").send({ order_id });
      assert.ok([401, 403].includes(res.status), `answered ${res.status} anonymously`);
    });

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "user" }, async () => {
      const res = await request(app).post("/api/quotes/profit_breakdown").send({ order_id });
      assert.equal(res.status, 403, "a customer read the business's margins");
    });

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "admin" }, async () => {
      const res = await request(app).post("/api/quotes/profit_breakdown").send({ order_id });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.order_id, order_id);
      assert.ok(!Number.isNaN(Date.parse(res.body.spots_at)), "spots_at is not a timestamp");
      for (const party of ["refiner", "dorado", "customer"]) {
        const c = res.body[party];
        assert.ok(c, `the breakdown is missing ${party}`);
        for (const cat of ["scrap", "bullion", "total"]) {
          for (const metal of ["gold", "silver", "platinum", "palladium"]) {
            for (const field of ["content", "percentage", "profit"]) {
              assert.equal(typeof c[cat][metal][field], "number", `${party}.${cat}.${metal}.${field} is not a number`);
              assert.ok(Number.isFinite(c[cat][metal][field]), `${party}.${cat}.${metal}.${field} is not finite`);
            }
          }
        }
        for (const field of ["shipping_net", "refiner_fee_net", "spot_net", "total_profit"]) {
          assert.equal(typeof c[field], "number", `${party}.${field} is not a number`);
          assert.ok(Number.isFinite(c[field]), `${party}.${field} is not finite`);
        }
      }
    });
  }, { actor: TEST_ACTOR.id });
});

// The margins are server-sourced like every other quote: a body riding spots,
// premiums or an order object in is priced identically to a clean one.
test("a poisoned profit-breakdown body changes nothing", async () => {
  await inPinnedTransaction(async (c) => {
    const seller = await aUser(c);
    const order = await anOrder(c, seller, { direction: "purchase" })
      .withLots(1).withSpots().withTotals({ shipping: 24.5 });
    const order_id = order.id;

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "admin" }, async () => {
      const clean = await request(app).post("/api/quotes/profit_breakdown").send({ order_id });
      assert.equal(clean.status, 200, JSON.stringify(clean.body));

      // The body is ONE id, strictly. Everything the old body could carry -
      // the order itself, both spot sets, the rate bands, the fees - is a
      // field the contract does not have, so it is refused rather than
      // silently discarded.
      const poisoned = await request(app).post("/api/quotes/profit_breakdown").send({
        order_id,
        order: { id: order_id, totals: { refiner_fee: 1000000 }, order_items: [] },
        orderSpots: [{ name: "Gold", bid: 1 }],
        refinerSpots: [{ name: "Gold", bid: 999999 }],
        spots: [{ name: "Gold", ask: 1, bid: 1 }],
        rates: [{ metal: "Gold", min_qty: 0, max_qty: null, scrap_pct: 0.0001, bullion_pct: 0.0001 }],
        shipping_fee_actual: 999999,
        payout: { cost: 999999 },
      });
      assert.equal(
        poisoned.status, 400, "the profit breakdown accepted a field besides the order id"
      );
    });
  }, { actor: TEST_ACTOR.id });
});
