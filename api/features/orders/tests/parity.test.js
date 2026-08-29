// The two order-creation paths, on the same input.
//
// This is the gate `diff` gives every other feature, in the one place `diff`
// cannot reach: `diff` compares READS, and orders is the only feature where the
// migration is a different creation flow rather than a different query. So the
// comparison has to place an order both ways and look at what each left behind.
//
// NEITHER PATH CALLS FEDEX HERE, and that is not a stub. createPurchaseOrder
// was rebuilt so the label and the courier happen BEFORE the transaction opens;
// what is left inside is purely rows, and recordPurchaseOrder is that half,
// exported so exactly one description of what an order is exists. A test that
// re-listed those repo calls by hand would be testing a copy of the
// implementation and would go on passing after the real one changed.
//
// WHAT THE TWO ARE EXPECTED TO AGREE ABOUT is narrower than "everything", and
// the disagreements are the interesting part - each one is either the new
// schema being more correct or a decision that has not been made yet. They are
// asserted individually below rather than filtered out of a comparison, because
// an ignore list hides the improvements along with the noise.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { decompose } from "#features/orders/intake.ts";
import * as intake from "#features/orders/intake.repo.ts";
import { createFromCheckout } from "#features/orders/create.ts";
import { recordPurchaseOrder } from "#features/orders/service.ts";

let client;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn) {
  await client.query("BEGIN");
  // Both creation paths write orders and snapshot an address, so both groups.
  await takeLocks(client, [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.SCRAP_SWEEP]);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// A real scrap row, because the legacy path inserts items by scrap_id and the
// foreign key is real. Created inside the transaction that is rolled back.
async function aScrap(c, over = {}) {
  const { rows: metal } = await c.query(
    `SELECT id, name FROM metals.metals WHERE name = 'Gold' LIMIT 1`
  );
  // exchange.scrap keys the metal by id and has no name column - the display
  // name comes from the metal. Checked against the table rather than assumed;
  // the first version of this guessed a `metal` text column and a `name`, and
  // neither exists.
  const { rows } = await c.query(
    `INSERT INTO exchange.scrap (metal_id, pre_melt, post_melt, purity, content, gross_unit, bid_premium)
     VALUES ($1, $2, $3, $4, $5, 'g', 0.8)
     RETURNING id`,
    [
      metal[0].id,
      over.pre_melt ?? 10, over.post_melt ?? 9.5,
      over.purity ?? 0.9999, over.content ?? 9.4991,
    ]
  );
  return { id: rows[0].id, metal_id: metal[0].id };
}

const blockFor = (scrap, address) => ({
  address: { id: address, name: "A Customer", phone_number: "5550000000" },
  package: { label: "Small Box", weight: { units: "LB", value: 3 } },
  pickup: { name: "Store Dropoff", date: "2026-09-01", time: "" },
  service: { serviceType: "FEDEX_EXPRESS_SAVER", serviceDescription: "Express Saver", netCharge: 24.5, code: "FDXE" },
  payout: { method: "ACH", account_holder_name: "A Customer", cost: 0 },
  insurance: { declaredValue: { amount: 5000, currency: "USD" }, insured: true },
  items: [
    {
      type: "scrap",
      data: {
        id: scrap.id, metal: "Gold", quantity: 1,
        pre_melt: 10, post_melt: 9.5, purity: 0.9999, content: 9.4991,
        gross_unit: "g", bid_premium: 0.8,
      },
    },
  ],
});

// Places the same order both ways and hands back what each produced.
async function bothWays(c) {
  // A user who HAS an address, rather than the first user and a hope. The
  // legacy path writes exchange.purchase_orders.address_id and the new one
  // snapshots places.addresses, so the row has to exist in both - which it
  // does, because the addresses dual-write mirrors it.
  const { rows: pair } = await c.query(
    `SELECT e.user_id, e.id AS address_id
       FROM exchange.addresses e
       JOIN places.addresses p ON p.id = e.id
       JOIN auth.users u ON u.id = e.user_id
      WHERE e.user_id IS NOT NULL
      ORDER BY e.id
      LIMIT 1`
  );
  if (!pair.length) return null;
  const user = [{ id: pair[0].user_id }];
  const addr = [{ id: pair[0].address_id }];

  const scrap = await aScrap(c);
  const block = blockFor(scrap, addr[0].id);

  const legacy_id = await recordPurchaseOrder(c, {
    purchase_order: block,
    user_id: user[0].id,
    label: { tracking_number: "PROBE0000001", buffer: null },
  });

  const described = decompose(block, { direction: "purchase", userId: user[0].id });
  const ids = await intake.resolve(described, c);
  const checkout_id = await intake.record(
    { described, ids, address_id: addr[0].id },
    c
  );
  const next = await createFromCheckout({ checkout_id, status: "In Transit" }, c);

  return { legacy_id, next, user_id: user[0].id, address_id: addr[0].id, scrap };
}

test("both paths record the same order, for the same customer, at the same status", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);
    assert.ok(placed, "dev has no user with an address to place an order for");

    const { rows: legacy } = await c.query(
      `SELECT user_id, purchase_order_status AS status FROM exchange.purchase_orders WHERE id = $1`,
      [placed.legacy_id]
    );
    const { rows: next } = await c.query(
      `SELECT user_id, status, direction FROM orders.orders WHERE id = $1`,
      [placed.next.order_id]
    );

    assert.equal(next[0].user_id, legacy[0].user_id);
    assert.equal(next[0].status, legacy[0].status);
    assert.equal(next[0].direction, "purchase");
  });
});

test("both paths record the same line, at the same weights and the same premium", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);

    const { rows: legacy } = await c.query(
      `SELECT i.quantity, i.premium, s.pre_melt, s.post_melt, s.purity, s.content, s.gross_unit
         FROM exchange.purchase_order_items i
         JOIN exchange.scrap s ON s.id = i.scrap_id
        WHERE i.purchase_order_id = $1`,
      [placed.legacy_id]
    );
    const { rows: next } = await c.query(
      `SELECT quantity, premium, pre_melt, post_melt, purity, content, unit
         FROM orders.items WHERE order_id = $1`,
      [placed.next.order_id]
    );

    assert.equal(next.length, legacy.length, "the two paths recorded a different number of lines");
    const num = (v) => (v == null ? null : Number(v));
    assert.equal(num(next[0].quantity), num(legacy[0].quantity));
    assert.equal(num(next[0].premium), num(legacy[0].premium));
    assert.equal(num(next[0].pre_melt), num(legacy[0].pre_melt));
    assert.equal(num(next[0].post_melt), num(legacy[0].post_melt));
    // Content deliberately does NOT match, and the difference is exchange
    // losing precision rather than the new schema inventing it. See the test
    // below, which is about exactly this.
    assert.equal(next[0].unit, legacy[0].gross_unit);
    // Purity is the same story: 0.9999 submitted, and exchange.scrap.purity is
    // numeric(4,3), so exchange holds 1.000 - a purity no metal has.
    assert.equal(num(next[0].purity), 0.9999, "the new schema rounded it too");
    assert.equal(num(legacy[0].purity), 1, "exchange.scrap.purity is no longer numeric(4,3)");
  });
});

// The scrap's weights live in exchange.scrap and on the item in the new schema.
// That relocation is the reason orders.items has so many columns, and it is
// what makes an order still read correctly after somebody edits a scrap row.
test("the new schema keeps the weights on the item rather than behind a join", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);

    await c.query(`UPDATE exchange.scrap SET content = 1 WHERE id = $1`, [placed.scrap.id]);

    const { rows: legacy } = await c.query(
      `SELECT s.content FROM exchange.purchase_order_items i
         JOIN exchange.scrap s ON s.id = i.scrap_id
        WHERE i.purchase_order_id = $1`,
      [placed.legacy_id]
    );
    const { rows: next } = await c.query(
      `SELECT content FROM orders.items WHERE order_id = $1`,
      [placed.next.order_id]
    );

    assert.equal(Number(legacy[0].content), 1, "the legacy order followed the edit");
    assert.equal(
      Number(next[0].content),
      9.4991,
      "the new order followed the edit too - the weights are not actually on the item"
    );
  });
});

// Both paths freeze a quote. exchange writes one per metal whether or not the
// order has any of it; the new schema writes one per metal the order contains.
// The difference is deliberate and is asserted rather than ignored.
test("exchange freezes four spots and the new schema freezes the one that was sold", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);

    const { rows: legacy } = await c.query(
      `SELECT type FROM exchange.order_metals WHERE purchase_order_id = $1 ORDER BY type`,
      [placed.legacy_id]
    );
    const { rows: next } = await c.query(
      `SELECT m.name FROM orders.spots s
         JOIN metals.metals m ON m.id = s.metal_id
        WHERE s.order_id = $1 ORDER BY m.name`,
      [placed.next.order_id]
    );

    assert.equal(legacy.length, 4, "exchange no longer writes a row per metal");
    assert.deepEqual(next.map((r) => r.name), ["Gold"]);
    assert.ok(
      legacy.map((r) => r.type).includes("Gold"),
      "the metal that was actually sold is missing from exchange's set"
    );
  });
});

// The one gap that is a decision rather than an improvement, and it is
// deliberate: a payout carries a routing number and an account number, and
// where those live - and whether they are encrypted - is open in FOLLOWUPS.md.
// Asserted so that when the payout is built the test says so by failing.
test("the legacy path writes a payout and the new one does not, yet", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);

    const { rows: legacy } = await c.query(
      `SELECT count(*)::int AS n FROM exchange.payouts WHERE order_id = $1`,
      [placed.legacy_id]
    );
    assert.equal(legacy[0].n, 1, "the legacy path stopped writing a payout");

    const { rows: next } = await c.query(
      `SELECT count(*)::int AS n FROM payments.details d
         JOIN payments.intents i ON i.details_id = d.id
        WHERE i.order_id = $1`,
      [placed.next.order_id]
    );
    assert.equal(
      next[0].n,
      0,
      "the new path now writes a payout - remove this test and compare the two properly"
    );
  });
});

// Both paths record where the parcel is coming from. exchange points the order
// at the address book row; the new schema takes a copy and remembers which row
// it came from.
test("both paths record the same address, one by reference and one by copy", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);

    const { rows: legacy } = await c.query(
      `SELECT address_id FROM exchange.purchase_orders WHERE id = $1`,
      [placed.legacy_id]
    );
    const { rows: next } = await c.query(
      `SELECT oa.address_id, oa.source_address_id, a.line_1, a.zip
         FROM orders.addresses oa
         JOIN places.addresses a ON a.id = oa.address_id
        WHERE oa.order_id = $1`,
      [placed.next.order_id]
    );

    assert.equal(legacy[0].address_id, placed.address_id);
    assert.equal(next[0].source_address_id, placed.address_id, "the book row it came from");
    assert.notEqual(next[0].address_id, placed.address_id, "the new schema takes a snapshot");

    const { rows: source } = await c.query(
      `SELECT line_1, zip FROM exchange.addresses WHERE id = $1`,
      [placed.address_id]
    );
    assert.equal(next[0].line_1, source[0].line_1, "the snapshot is not of the same address");
    assert.equal(next[0].zip, source[0].zip);
  });
});

// exchange records the handover as a text column on the shipment. The new
// schema records it as a fulfillment with a method, which is the whole point of
// the fulfillments schema existing.
test("the handoff exchange stores as a string becomes a fulfillment with a method", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);

    const { rows: legacy } = await c.query(
      `SELECT pickup_type FROM exchange.shipments WHERE purchase_order_id = $1`,
      [placed.legacy_id]
    );
    assert.equal(legacy[0].pickup_type, "Store Dropoff");

    const { rows: next } = await c.query(
      `SELECT m.type, m.category, m.direction FROM fulfillments.fulfillments f
         JOIN fulfillments.methods m ON m.id = f.method_id
        WHERE f.order_id = $1`,
      [placed.next.order_id]
    );
    // The same mapping 052_backfill_fulfillments.sql applied to all 70
    // production shipments, so an order placed today and one migrated from
    // January land on the same method row.
    assert.equal(next[0].type, "CARRIER DROPOFF");
    assert.equal(next[0].category, "SHIPMENT");
    assert.equal(next[0].direction, "purchase");
  });
});

test("the two paths take different order numbers from the same sequence", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);

    const { rows: legacy } = await c.query(
      `SELECT order_number FROM exchange.purchase_orders WHERE id = $1`,
      [placed.legacy_id]
    );
    assert.notEqual(
      Number(placed.next.number),
      Number(legacy[0].order_number),
      "two orders took the same number - the sequence is not shared after all"
    );
  });
});


// THE FINDING THIS COMPARISON PRODUCED, and it is in exchange rather than in the
// migration.
//
// exchange.scrap constrains pre_melt, post_melt, content and purity to
// numeric(_,3). Migration 058 widened orders.items after audit:precision caught
// .9999 fine gold being stored as 1.000 there - but that was the DESTINATION.
// The source still rounds, so a scrap line entered today loses the fourth
// decimal before anything migrates it.
//
// Production holds two scrap rows at purity exactly 1.000, which is a purity no
// metal has; they were almost certainly entered as .9999 and rounded up.
// Content is pre_melt x purity, so those two lines are overstated by about
// 0.01% - in the customer's favour, so it costs the business rather than them.
//
// Widening exchange.scrap would stop future loss and is NOT done here:
// lint:migrations classifies ALTER COLUMN TYPE against exchange as destructive
// and requires an explicit marker saying what backup exists, and no pg_dump of
// production has been taken yet. That is Jacob's call, and it is in
// FOLLOWUPS.md.
test("exchange rounds a scrap line to three decimals and the new schema does not", async () => {
  await inRollback(async (c) => {
    const placed = await bothWays(c);

    const { rows: legacy } = await c.query(
      `SELECT s.content, s.purity FROM exchange.purchase_order_items i
         JOIN exchange.scrap s ON s.id = i.scrap_id
        WHERE i.purchase_order_id = $1`,
      [placed.legacy_id]
    );
    const { rows: next } = await c.query(
      `SELECT content, purity FROM orders.items WHERE order_id = $1`,
      [placed.next.order_id]
    );

    assert.equal(Number(legacy[0].content), 9.499, "exchange.scrap.content is no longer numeric(_,3)");
    assert.equal(Number(next[0].content), 9.4991, "the new schema lost the fourth decimal too");

    assert.equal(Number(legacy[0].purity), 1, "9.4991 of .9999 gold is recorded as pure");
    assert.equal(Number(next[0].purity), 0.9999);

    // The scale is the mechanism, and asserting it means this test says
    // something specific if somebody widens the column.
    const { rows: cols } = await c.query(
      `SELECT column_name, numeric_scale
         FROM information_schema.columns
        WHERE table_schema = 'exchange' AND table_name = 'scrap'
          AND column_name IN ('content', 'purity', 'pre_melt', 'post_melt')
        ORDER BY column_name`
    );
    assert.deepEqual(
      cols.map((r) => `${r.column_name}:${r.numeric_scale}`),
      ["content:3", "post_melt:3", "pre_melt:3", "purity:3"],
      "exchange.scrap has been widened - update FOLLOWUPS and delete this test"
    );
  });
});
