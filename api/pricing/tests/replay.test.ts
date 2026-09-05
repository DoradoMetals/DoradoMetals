import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

const EXACT = 1e-9;

type SpotFixture = { name: string; ask: number; bid: number };
type ProductFixture = {
  id: string; name: string; content: number; ask_premium: number; bid_premium: number;
};
type BuyerFixture = { id: string; name: string | null; email: string | null };

let gold: SpotFixture;
let product: ProductFixture;
let hidden: { id: string };
let buyer: BuyerFixture;

beforeAll(async () => {
  const spots = await outside<SpotFixture>(
    `SELECT s.metal_id, s.ask, s.bid
       FROM spots.spots s
      WHERE s.metal_id = 'Gold'`
  );
  gold = spots[0];
  assert.ok(gold, "dev has no Gold spot row - every check here would be vacuous");
  assert.ok(gold.ask > 0 && gold.bid > 0, "dev's Gold spot is not priced");

  const products = await outside<ProductFixture>(
    `SELECT b.id, b.name, b.content, b.ask_premium, b.bid_premium
       FROM products.bullion b
      WHERE b.display AND b.content IS NOT NULL AND b.metal_id = 'Gold'
      ORDER BY b.name LIMIT 1`
  );
  product = products[0];
  assert.ok(product, "dev has no gold product live in both directions");

  const hiddens = await outside<{ id: string }>(
    `SELECT id FROM products.bullion WHERE NOT display LIMIT 1`
  );
  hidden = hiddens[0];
  assert.ok(hidden, "dev has no display=false product");

  const buyers = await outside<BuyerFixture>(
    `SELECT id, name, email FROM auth.users ORDER BY dorado_funds DESC NULLS LAST, id LIMIT 1`
  );
  buyer = buyers[0];
  assert.ok(buyer, "dev has no user to buy as");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("the product quote is public and prices both sides at the server's spot", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const ask = await request(app)
        .post("/api/quotes/catalog")
        .send({ bullion_id: product.id, side: "ask", quantity: 2 });
      assert.equal(ask.status, 200, JSON.stringify(ask.body));
      assert.equal(ask.body.side, "ask");
      assert.ok(!Number.isNaN(Date.parse(ask.body.spots_at)), "spots_at is not a timestamp");

      const unit = product.content * (gold.ask * product.ask_premium);
      assert.ok(
        Math.abs(ask.body.unit_price - unit) < EXACT,
        `ask unit_price ${ask.body.unit_price} != hand-computed ${unit}`
      );
      assert.ok(
        Math.abs(ask.body.line_total - unit * 2) < EXACT, "line_total is not unit x quantity"
      );

      const bid = await request(app)
        .post("/api/quotes/catalog")
        .send({ bullion_id: product.id, side: "bid" });
      assert.equal(bid.status, 200, JSON.stringify(bid.body));
      const bidUnit = product.content * (gold.bid * product.bid_premium);
      assert.ok(
        Math.abs(bid.body.unit_price - bidUnit) < EXACT,
        `bid unit_price ${bid.body.unit_price} != hand-computed ${bidUnit}`
      );
      assert.equal(bid.body.quantity, 1, "an omitted quantity is one");
    });
  }, { actor: TEST_ACTOR.id });
});

test("a display=false product is refused on the ask side and quoted on the bid side", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const refused = await request(app)
        .post("/api/quotes/catalog")
        .send({ bullion_id: hidden.id, side: "ask" });
      assert.equal(refused.status, 404, `a hidden product priced on the ask side`);

      const quoted = await request(app)
        .post("/api/quotes/catalog")
        .send({ bullion_id: hidden.id, side: "bid" });
      assert.equal(quoted.status, 200, JSON.stringify(quoted.body));
    });
  }, { actor: TEST_ACTOR.id });
});

test("the checkout quote needs a session for either direction; the product quote does not", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const direction of ["sale", "purchase"]) {
        const res = await request(app).get("/api/quotes/checkout").query({ direction });
        assert.ok(
          [401, 403].includes(res.status),
          `${direction} checkout quote answered ${res.status} with no session`
        );
      }

      const pub = await request(app)
        .post("/api/quotes/catalog")
        .send({ bullion_id: product.id, side: "ask" });
      assert.equal(pub.status, 200, `the product quote answered ${pub.status} anonymously`);
      assert.ok(pub.body.unit_price > 0, "the anonymous estimate priced at nothing");
    });
  }, { actor: TEST_ACTOR.id });
});

test("no body-supplied price, spot or premium is accepted at all", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const clean = await request(app)
        .post("/api/quotes/catalog")
        .send({ bullion_id: product.id, side: "ask", quantity: 2 });
      assert.equal(clean.status, 200, JSON.stringify(clean.body));
      assert.ok(clean.body.unit_price > 1, "the clean quote itself is suspiciously tiny");

      for (const field of ["unit_price", "price", "ask_premium", "content", "spot"]) {
        const one = await request(app).post("/api/quotes/catalog").send({
          bullion_id: product.id, side: "ask", quantity: 2, [field]: 0.01,
        });
        assert.equal(one.status, 400, `a product quote carrying ${field} was accepted`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("an admin may name a subject; a customer naming somebody else is refused", async () => {
  await inPinnedTransaction(async (c) => {
    const target = await aUser(c, { funds: 4321 });
    const query = { direction: "sale", user_id: target.id };

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "admin" }, async () => {
      const res = await request(app).get("/api/quotes/checkout").query(query);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.direction, "sale");
      assert.ok(
        Math.abs(res.body.beginning_funds - 4321) < EXACT,
        `an admin naming a user got beginning_funds ${res.body.beginning_funds}, not 4321`
      );
    });

    await as({ id: buyer.id, name: buyer.name, email: buyer.email, role: "user" }, async () => {
      const res = await request(app).get("/api/quotes/checkout").query(query);
      assert.equal(res.status, 403, "a customer naming somebody else was substituted, not refused");
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });
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
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.order_id, order_id);
      assert.deepEqual(
        res.body.parties.map((p: { party: string }) => p.party).sort(),
        ["customer", "dorado", "refiner"],
        "the wire is missing a party"
      );
      for (const party of res.body.parties) {
        for (const field of [
          "metals_profit", "shipping_net", "refiner_fee_net", "spot_net", "total_profit",
        ]) {
          assert.ok(
            Number.isFinite(party[field]), `${party.party}.${field} is not finite`
          );
        }
      }
    });
  }, { actor: TEST_ACTOR.id });
});
