// The quote endpoints, over real HTTP.
//
// What this file pins is the ruling itself: every number here is priced by
// the server from its own tables, and a body that rides prices or spots in
// changes NOTHING - the $26.81 regression (see getSpotPrices' header)
// stays dead. The math checks are hand-computed from the same tables the
// endpoints read, so a transposed spot, a dropped premium or a quantity
// applied twice all fail loudly.
//
// Everything runs inside the pin. The endpoints only read, but so did
// tracking.test.js until it did not - the pin is what makes that claim
// enforced rather than assumed. No lock: quotes write nothing, like spots.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

const CENTS = 0.005; // money reconciliation tolerance: within half a cent
const EXACT = 1e-9;  // same floats, same tables, same order of operations

let spots;      // { name, ask, bid } per metal, from the tables the API reads
let gold;       // the Gold spot row
let product;    // a Gold product live in BOTH directions, with content
let hiddenAsk;  // display = false but sell_display = true: refused only on ask
let buyer;      // a real user row with an address, for the guarded quotes

before(async () => {
  spots = await outside(
    `SELECT m.name, s.ask, s.bid
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id`
  );
  gold = spots.find((s) => s.name === "Gold");
  assert.ok(gold?.ask > 0 && gold?.bid > 0, "dev has no usable Gold spot - every check here would be vacuous");

  const products = await outside(
    `SELECT b.id, b.name, b.content, b.ask_premium, b.bid_premium, m.name AS metal
       FROM products.bullion b JOIN metals.metals m ON m.id = b.metal_id
      WHERE b.display AND b.sell_display AND b.content IS NOT NULL
        AND b.ask_premium IS NOT NULL AND b.bid_premium IS NOT NULL
        AND m.name = 'Gold'
      ORDER BY b.name LIMIT 1`
  );
  product = products[0];
  assert.ok(product, "dev has no gold product live in both directions");

  const hiddens = await outside(
    `SELECT id FROM products.bullion WHERE NOT display AND sell_display LIMIT 1`
  );
  hiddenAsk = hiddens[0];
  assert.ok(hiddenAsk, "dev has no display=false, sell_display=true product");

  const buyers = await outside(
    `SELECT u.id, u.name, u.email, u.dorado_funds, a.id AS address_id, a.state
       FROM exchange.users u JOIN exchange.addresses a ON a.user_id = u.id
      ORDER BY u.dorado_funds DESC NULLS LAST, u.id LIMIT 1`
  );
  buyer = buyers[0];
  assert.ok(buyer, "dev has no user with an address");
});

after(async () => {
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
  });
});

test("a display=false product is refused on the ask side and quoted on the bid side", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const refused = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: hiddenAsk.id }], side: "ask" });
      assert.equal(refused.status, 400, `a hidden product priced on the ask side (${refused.status})`);
      assert.match(refused.body?.error?.message ?? "", /not available/);

      // The same id on the bid side: sell_display governs there, and this
      // fixture is sell-live. The gate is per side, not per product.
      const quoted = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: hiddenAsk.id }], side: "bid" });
      assert.equal(quoted.status, 200, `a sell-live product was refused on the bid side (${quoted.status}): ${JSON.stringify(quoted.body)}`);
    });
  });
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
        .send({ items: [{ type: "product", data: { id: product.id, quantity: 1 } }] });
      assert.equal(pub.status, 200, `purchase_order answered ${pub.status} anonymously`);
      assert.ok(pub.body.total > 0, "the anonymous estimate priced at nothing");
    });
  });
});

test("the sales-order breakdown reconciles to the cent and funds come from the user's row", async () => {
  await inPinnedTransaction(async () => {
    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      const res = await request(app).post("/api/quotes/sales_order").send({
        items: [{ id: product.id, quantity: 2 }],
        using_funds: true,
        shipping_service: "STANDARD",
        payment_method: "CARD",
        address_id: buyer.address_id,
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
      const lineSum = b.items.reduce((acc, i) => acc + i.line_total, 0);
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

      // Funds come from the SESSION user's exchange.users row - never the
      // body, and not from the mocked session object either (it carries no
      // dorado_funds at all, which is the point).
      assert.ok(Math.abs(b.beginning_funds - Number(buyer.dorado_funds ?? 0)) < EXACT,
        `beginning_funds ${b.beginning_funds} is not the user's row balance ${buyer.dorado_funds}`);
      const applied = Math.min(b.beginning_funds, b.base_total);
      assert.ok(Math.abs(b.ending_funds - (b.beginning_funds - applied)) < CENTS,
        "ending_funds is not beginning minus what was applied");
      assert.ok(Math.abs(b.pre_charges_amount - applied) < CENTS, "using_funds did not apply the funds");

      // CARD surcharges at 2.9% of what is left to charge.
      if (b.subject_to_charges_amount > 0) {
        assert.ok(Math.abs(b.charges_amount - b.subject_to_charges_amount * 0.029) < CENTS,
          "the CARD surcharge is not 2.9% of the charged amount");
      }
      // getShippingCharge: free over $1000, else STANDARD is $25.
      assert.equal(b.shipping_charge, b.item_total > 1000 ? 0 : 25);
    });
  });
});

// ---------------------------------------------------------- purchase order

test("the purchase-order quote prices scrap and product lines from the rates band for the metal total", async () => {
  await inPinnedTransaction(async () => {
    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      // 124.414g at .500 purity = exactly 2 troy oz of content, derived by
      // the SERVER - the body carries no content field at all.
      const scrap = { type: "scrap", data: { metal: "Gold", pre_melt: 124.414, purity: 0.5, gross_unit: "g" } };
      const line = { type: "product", data: { name: product.name, quantity: 2 } };

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
      assert.equal(res.body.declared_value, res.body.total, "declared_value is specified as the total");

      // BOTH SPELLINGS of the product name resolve (D73): data.name above,
      // data.product_name here, same product, same prices.
      const other = await request(app).post("/api/quotes/purchase_order").send({
        items: [scrap, { type: "product", data: { product_name: product.name, quantity: 2 } }],
      });
      assert.equal(other.status, 200);
      assert.deepEqual(other.body.items, res.body.items,
        "data.product_name resolved differently from data.name");
    });
  });
});

// ------------------------------------------------- the $26.81 regression pin

// A body that rides spots, prices or premiums in is priced IDENTICALLY to a
// clean one. This is the regression that once sold an ounce of gold for
// $26.81: items were server-fetched, and only the metal price was taken on
// trust. Nothing price-shaped in a request may ever be read again.
test("no body-supplied price, spot or premium is ever honoured", async () => {
  await inPinnedTransaction(async () => {
    const poison = {
      spots: [{ type: "Gold", name: "Gold", ask_spot: 1, bid_spot: 1, ask: 1, bid: 1 }],
      spot_prices: [{ type: "Gold", ask_spot: 1, bid_spot: 1 }],
      ask_spot: 1,
      bid_spot: 1,
      price: 0.01,
      total: 0.01,
    };
    const stripTimestamp = ({ spots_at, ...rest }) => rest;

    await anonymous(async () => {
      const clean = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: product.id, quantity: 2 }], side: "ask" });
      const poisoned = await request(app).post("/api/quotes/catalog").send({
        ...poison,
        items: [{ id: product.id, quantity: 2, unit_price: 0.01, price: 0.01, ask_premium: 0 }],
        side: "ask",
      });
      assert.equal(poisoned.status, 200);
      assert.deepEqual(stripTimestamp(poisoned.body), stripTimestamp(clean.body),
        "a catalogue quote read something price-shaped off the body");
      // And the honest number is nowhere near the poisoned one.
      assert.ok(clean.body.items[0].unit_price > 1, "the clean quote itself is suspiciously tiny");
    });

    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      const base = {
        items: [{ id: product.id, quantity: 2 }],
        using_funds: false,
        shipping_service: "STANDARD",
        payment_method: "CARD",
        address_id: buyer.address_id,
      };
      const clean = await request(app).post("/api/quotes/sales_order").send(base);
      const poisoned = await request(app).post("/api/quotes/sales_order").send({
        ...base,
        ...poison,
        items: [{ id: product.id, quantity: 2, ask_premium: 0, price: 0.01 }],
        dorado_funds: 1000000,
        user: { dorado_funds: 1000000 },
      });
      assert.equal(poisoned.status, 200);
      assert.deepEqual(stripTimestamp(poisoned.body), stripTimestamp(clean.body),
        "a sales-order quote read something price-shaped off the body");

      const sellBase = {
        items: [
          { type: "scrap", data: { metal: "Gold", pre_melt: 124.414, purity: 0.5, gross_unit: "g" } },
          { type: "product", data: { id: product.id, quantity: 1 } },
        ],
      };
      const cleanSell = await request(app).post("/api/quotes/purchase_order").send(sellBase);
      const poisonedSell = await request(app).post("/api/quotes/purchase_order").send({
        ...poison,
        items: [
          { type: "scrap", data: { ...sellBase.items[0].data, bid_premium: 0.0001, premium: 0.0001 } },
          { type: "product", data: { id: product.id, quantity: 1, bid_premium: 0.0001, content: 9999 } },
        ],
      });
      assert.equal(poisonedSell.status, 200);
      assert.deepEqual(stripTimestamp(poisonedSell.body), stripTimestamp(cleanSell.body),
        "a purchase-order quote read a premium, spot or product content off the body");
    });
  });
});


// ------------------------------------------------- the profit breakdown

// ADMIN ONLY, and asserted from both sides: the response is the business's
// margins on a customer's order, so the customer being refused is as much the
// contract as the admin being answered. Priced against the oldest purchase
// order, the same stable fixture the ownership tests pick.
test("the profit breakdown answers an admin and refuses everyone else", async () => {
  await inPinnedTransaction(async () => {
    const orders = await outside(
      `SELECT id FROM exchange.purchase_orders ORDER BY created_at ASC, id ASC LIMIT 1`
    );
    assert.ok(orders[0], "dev has no purchase order to price");
    const order_id = orders[0].id;

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
  });
});

// The margins are server-sourced like every other quote: a body riding spots,
// premiums or an order object in is priced identically to a clean one.
test("a poisoned profit-breakdown body changes nothing", async () => {
  await inPinnedTransaction(async () => {
    const orders = await outside(
      `SELECT id FROM exchange.purchase_orders ORDER BY created_at ASC, id ASC LIMIT 1`
    );
    const order_id = orders[0].id;
    const stripTimestamp = ({ spots_at, ...rest }) => rest;

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "admin" }, async () => {
      const clean = await request(app).post("/api/quotes/profit_breakdown").send({ order_id });
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
      assert.equal(poisoned.status, 200);
      assert.deepEqual(stripTimestamp(poisoned.body), stripTimestamp(clean.body),
        "the profit breakdown read something off the body besides the order id");
    });
  });
});
