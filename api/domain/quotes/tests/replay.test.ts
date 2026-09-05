import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { aUser, anOrder, anAddress, aHandover } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

const CENTS = 0.005;
const EXACT = 1e-9;

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

let spots: SpotFixture[];
let gold: SpotFixture;
let product: ProductFixture;
let hiddenAsk: { id: string };
let buyer: BuyerFixture;
let goldId: string;
let standardId: string;
let cardId: string;

beforeAll(async () => {
  spots = await outside<SpotFixture>(
    `SELECT m.name, s.ask, s.bid
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id`
  );
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

  const buyers = await outside<BuyerFixture>(
    `SELECT id, name, email, dorado_funds FROM auth.users
      ORDER BY dorado_funds DESC NULLS LAST, id LIMIT 1`
  );
  buyer = buyers[0];
  assert.ok(buyer, "dev has no user to buy as");

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

test("the catalogue quote is public and prices both sides at the server's spot", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const ask = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: product.id, quantity: 2 }], side: "ask" });
      assert.equal(ask.status, 200, `the public catalogue quote answered ${ask.status}: ${JSON.stringify(ask.body)}`);
      assert.equal(ask.body.side, "ask");
      assert.ok(!Number.isNaN(Date.parse(ask.body.spots_at)), "spots_at is not a timestamp");

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
      assert.equal(refused.status, 422, `a hidden product priced on the ask side (${refused.status})`);
      assert.match(refused.body?.error?.message ?? "", /not available/);

      const quoted = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: hiddenAsk.id }], side: "bid" });
      assert.equal(quoted.status, 200, `a sell-live product was refused on the bid side (${quoted.status}): ${JSON.stringify(quoted.body)}`);
    });
  }, { actor: TEST_ACTOR.id });
});

test("the checkout quote needs a session for either direction; the catalogue quote does not", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const sale = await request(app).get("/api/quotes/checkout").query({ direction: "sale" });
      assert.ok(
        [401, 403].includes(sale.status), `sale checkout quote answered ${sale.status} with no session`
      );

      const purchase = await request(app)
        .get("/api/quotes/checkout").query({ direction: "purchase" });
      assert.ok(
        [401, 403].includes(purchase.status),
        `purchase checkout quote answered ${purchase.status} with no session`
      );

      const pub = await request(app)
        .post("/api/quotes/catalog")
        .send({ items: [{ id: product.id, quantity: 1 }], side: "ask" });
      assert.equal(pub.status, 200, `the catalogue quote answered ${pub.status} anonymously`);
      assert.ok(pub.body.total > 0, "the anonymous estimate priced at nothing");
    });
  }, { actor: TEST_ACTOR.id });
});

test("the sales-order breakdown reconciles to the cent and funds come from the user's row", async () => {
  await inPinnedTransaction(async (c) => {
    const address = await anAddress(c, buyer, { default_shipping: false });
    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      const basket = await request(app)
        .put("/api/checkout/items").query({ direction: "sale" })
        .send({ items: [{ bullion_id: product.id, quantity: 2 }] });
      assert.equal(basket.status, 200, basket.text);

      const patched = await request(app).patch("/api/checkout").send({
        direction: "sale",
        recipient_address_id: address.id,
        payment_method_id: cardId,
      });
      assert.equal(patched.status, 200, patched.text);
      await aHandover(c, patched.body.id, {
        direction: "sale",
        method: "DROPSHIP",
        choices: { shipment: { carrier_service_id: standardId } },
      });

      const res = await request(app).get("/api/quotes/checkout").query({ direction: "sale" });
      assert.equal(res.status, 200, `the sales-order quote answered ${res.status}: ${JSON.stringify(res.body)}`);
      const b = res.body;

      for (const field of [
        "item_total", "base_total", "shipping_charge", "beginning_funds",
        "ending_funds", "pre_charges_amount", "subject_to_charges_amount",
        "post_charges_amount", "charges_amount", "sales_tax", "order_total",
      ]) {
        assert.ok(typeof b[field] === "number", `the breakdown is missing ${field}`);
      }

      const unit = product.content * (gold.ask * product.ask_premium);
      assert.ok(Math.abs(b.items[0].unit_ask - unit) < EXACT, `unit_ask ${b.items[0].unit_ask} != ${unit}`);
      assert.ok(Math.abs(b.item_total - unit * 2) < EXACT, "item_total is not the sum of the lines");
      const lineSum = b.items.reduce((acc: number, i: { line_total: number }) => acc + i.line_total, 0);
      assert.ok(Math.abs(lineSum - b.item_total) < CENTS, "the lines do not sum to item_total");

      assert.ok(Math.abs(b.item_total + b.shipping_charge + b.sales_tax - b.base_total) < CENTS,
        "base_total != item_total + shipping + tax");
      assert.ok(Math.abs(b.base_total - b.pre_charges_amount - b.subject_to_charges_amount) < CENTS,
        "funds applied + amount charged != base_total");
      assert.ok(Math.abs(b.post_charges_amount - b.subject_to_charges_amount - b.charges_amount) < CENTS,
        "post_charges != subject + surcharge");
      assert.ok(Math.abs(b.order_total - b.pre_charges_amount - b.post_charges_amount) < CENTS,
        "order_total != pre + post");

      assert.ok(Math.abs(b.beginning_funds - Number(buyer.dorado_funds ?? 0)) < EXACT,
        `beginning_funds ${b.beginning_funds} is not the user's row balance ${buyer.dorado_funds}`);
      const applied = Math.min(b.beginning_funds, b.base_total);
      assert.ok(Math.abs(b.ending_funds - (b.beginning_funds - applied)) < CENTS,
        "ending_funds is not beginning minus what was applied");
      assert.ok(Math.abs(b.pre_charges_amount - applied) < CENTS,
        "the customer's balance was not applied - credit applies whenever there is one");

      if (b.subject_to_charges_amount > 0) {
        assert.ok(Math.abs(b.charges_amount - b.subject_to_charges_amount * 0.029) < CENTS,
          "the CARD surcharge is not 2.9% of the charged amount");
      }
      assert.equal(b.shipping_charge, b.item_total > 1000 ? 0 : 25);
    });
  }, { actor: TEST_ACTOR.id });
});

test("an admin's sales-order quote prices the named user's funds; a customer naming one is refused", async () => {
  await inPinnedTransaction(async () => {
    const targets = await outside(
      `SELECT id, dorado_funds FROM auth.users
        WHERE id <> $1 AND dorado_funds IS NOT NULL
          AND dorado_funds IS DISTINCT FROM $2
        ORDER BY dorado_funds DESC, id LIMIT 1`,
      [buyer.id, buyer.dorado_funds]
    );
    const target = targets[0];
    assert.ok(target, "dev has no second user with a different balance - the subject check would be vacuous");

    const query = { direction: "sale", user_id: target.id };

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "admin" }, async () => {
      const res = await request(app).get("/api/quotes/checkout").query(query);
      assert.equal(res.status, 200, `the admin quote answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(Math.abs(res.body.beginning_funds - Number(target.dorado_funds)) < EXACT,
        `an admin naming a user got beginning_funds ${res.body.beginning_funds}, not that user's row balance ${target.dorado_funds}`);
    });

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "user" }, async () => {
      const res = await request(app).get("/api/quotes/checkout").query(query);
      assert.equal(res.status, 403, "a customer naming somebody else should be refused, not substituted");
    });
  }, { actor: TEST_ACTOR.id });
});

test("the purchase-order quote prices scrap and product lines from the rates band for the metal total", async () => {
  await inPinnedTransaction(async () => {
    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      const scrap = {
        metal_id: goldId, pre_melt: 124.414, purity: 0.5, unit: "g", quantity: 1,
      };
      const line = { bullion_id: product.id, quantity: 2 };

      const basket = await request(app)
        .put("/api/checkout/items").query({ direction: "purchase" })
        .send({ items: [scrap, line] });
      assert.equal(basket.status, 200, basket.text);

      const res = await request(app).get("/api/quotes/checkout").query({ direction: "purchase" });
      assert.equal(res.status, 200, `the purchase-order quote answered ${res.status}: ${JSON.stringify(res.body)}`);
      const s = res.body.items.find((i: { kind: string }) => i.kind === "scrap");
      const p = res.body.items.find((i: { kind: string }) => i.kind === "product");
      assert.ok(s && p, "both lines should be in the quote");

      const scrapContent = (124.414 / 31.1035) * 0.5;
      assert.ok(Math.abs(s.content - scrapContent) < EXACT, `derived scrap content ${s.content} != ${scrapContent}`);
      assert.equal(p.metal, "Gold");

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

      const scrapUnit = scrapContent * (gold.bid * Number(bands[0].scrap_pct));
      const productUnit = Number(product.content) * (gold.bid * Number(bands[0].bullion_pct));
      assert.ok(Math.abs(s.unit_price - scrapUnit) < EXACT, `scrap unit ${s.unit_price} != ${scrapUnit}`);
      assert.ok(Math.abs(s.line_total - scrapUnit) < EXACT, "scrap line_total should not multiply by quantity");
      assert.ok(Math.abs(p.unit_price - productUnit) < EXACT, `product unit ${p.unit_price} != ${productUnit}`);
      assert.ok(Math.abs(p.line_total - productUnit * 2) < EXACT, "product line_total is not unit * quantity");

      assert.ok(Math.abs(res.body.total - (s.line_total + p.line_total)) < EXACT, "total is not the sum of the lines");
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
    });
  }, { actor: TEST_ACTOR.id });
});

test("no body-supplied price, spot or premium is accepted at all", async () => {
  await inPinnedTransaction(async (c) => {
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
      assert.ok(clean.body.items[0].unit_price > 1, "the clean quote itself is suspiciously tiny");

      const poisoned = await request(app).post("/api/quotes/catalog").send({
        ...poison,
        items: [{ id: product.id, quantity: 2, unit_price: 0.01, price: 0.01, ask_premium: 0 }],
        side: "ask",
      });
      assert.equal(poisoned.status, 400, "a catalogue quote accepted something price-shaped");

      for (const field of ["unit_price", "price", "ask_premium", "content"]) {
        const one = await request(app).post("/api/quotes/catalog").send({
          items: [{ id: product.id, quantity: 2, [field]: 0.01 }], side: "ask",
        });
        assert.equal(one.status, 400, `a catalogue line carrying ${field} was accepted`);
      }
    });

    await as({ id: buyer.id, name: buyer.name, email: buyer.email }, async () => {
      const patched = await request(app).patch("/api/checkout").send({
        direction: "sale", recipient_address_id: address.id, payment_method_id: cardId,
      });
      assert.equal(patched.status, 200, patched.text);
      await aHandover(c, patched.body.id, {
        direction: "sale", method: "DROPSHIP",
        choices: { shipment: { carrier_service_id: standardId } },
      });

      const clean = await request(app)
        .put("/api/checkout/items").query({ direction: "sale" })
        .send({ items: [{ bullion_id: product.id, quantity: 2 }] });
      assert.equal(clean.status, 200, clean.text);

      for (const poisonedLine of [
        { bullion_id: product.id, quantity: 2, unit_price: 0.01 },
        { bullion_id: product.id, quantity: 2, price: 0.01 },
        { bullion_id: product.id, quantity: 2, content: 9999 },
        { bullion_id: product.id, quantity: 2, purity: 0.9999 },
      ]) {
        const poisoned = await request(app)
          .put("/api/checkout/items").query({ direction: "sale" })
          .send({ items: [poisonedLine] });
        assert.ok(
          poisoned.status >= 400 && poisoned.status < 500,
          `a sale basket line accepted ${JSON.stringify(Object.keys(poisonedLine))}: ${poisoned.status}`
        );
      }

      const cleanQuote = await request(app)
        .get("/api/quotes/checkout").query({ direction: "sale", ...poison });
      assert.equal(cleanQuote.status, 200, JSON.stringify(cleanQuote.body));
      assert.ok(
        Math.abs(cleanQuote.body.beginning_funds - Number(buyer.dorado_funds ?? 0)) < EXACT,
        "a poisoned querystring changed the priced funds"
      );

      const sellBasket = await request(app)
        .put("/api/checkout/items").query({ direction: "purchase" })
        .send({
          items: [
            { metal_id: goldId, pre_melt: 124.414, purity: 0.5, unit: "g", quantity: 1 },
            { bullion_id: product.id, quantity: 1 },
          ],
        });
      assert.equal(sellBasket.status, 200, sellBasket.text);
      const cleanSell = await request(app)
        .get("/api/quotes/checkout").query({ direction: "purchase" });
      assert.equal(cleanSell.status, 200, JSON.stringify(cleanSell.body));
      assert.ok(cleanSell.body.total > 1, "the clean sell quote itself is suspiciously tiny");

      for (const poisonedLine of [
        { metal_id: goldId, pre_melt: 124.414, purity: 0.5, unit: "g", quantity: 1, content: 9999 },
        { metal_id: goldId, pre_melt: 124.414, purity: 0.5, unit: "g", quantity: 1, premium: 0.0001 },
        { bullion_id: product.id, quantity: 1, bid_premium: 0.0001 },
        { bullion_id: product.id, quantity: 1, content: 9999 },
      ]) {
        const poisonedSell = await request(app)
          .put("/api/checkout/items").query({ direction: "purchase" })
          .send({ items: [poisonedLine] });
        assert.ok(
          poisonedSell.status >= 400 && poisonedSell.status < 500,
          `a purchase basket line accepted ${JSON.stringify(Object.keys(poisonedLine))}: ${poisonedSell.status}`
        );
      }
    });
  }, { actor: TEST_ACTOR.id });
});

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

test("a poisoned profit-breakdown body changes nothing", async () => {
  await inPinnedTransaction(async (c) => {
    const seller = await aUser(c);
    const order = await anOrder(c, seller, { direction: "purchase" })
      .withLots(1).withSpots().withTotals({ shipping: 24.5 });
    const order_id = order.id;

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "admin" }, async () => {
      const clean = await request(app).post("/api/quotes/profit_breakdown").send({ order_id });
      assert.equal(clean.status, 200, JSON.stringify(clean.body));

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
