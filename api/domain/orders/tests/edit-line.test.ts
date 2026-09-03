// Service-level atomicity for the two operations that delete or reprice.
//
// The executor problem has a mirror image at this layer: a service that makes
// several repo calls without a transaction commits each one separately, so a
// failure partway leaves half the work done.
//
// SINCE D212 the scrap IS the line: orders.items carries the declared weights
// and refiners.items the assay actuals, so "delete the scrap with its line"
// became one guarded statement plus a cascade. What still needs the
// transaction is the RE-TIER that follows a delete - survivors repriced from
// the changed per-metal totals - and the weights+premium pair on an edit.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { LOCKS } from "#shared/testing/locks.ts";
import * as orders from "#domain/orders/service.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();

  // THE ORDERS LOCK, HELD FOR THE WHOLE FILE - and a SESSION lock, not the
  // transaction-scoped one every other file uses. takeLocks() cannot be used
  // here: it takes pg_advisory_xact_lock, and THIS FILE HAS NO TRANSACTIONS.
  // Every statement autocommits, so a transaction-scoped lock would be
  // released before the next statement ran. A session lock contends in the
  // same lock space, so it serialises correctly against every file that takes
  // ORDERS the ordinary way.
  await client.query("SELECT pg_advisory_lock($1)", [LOCKS.ORDERS]);
});

afterAll(async () => {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCKS.ORDERS]);
  client.release();
  await pool.end();
});

// Builds a NATIVE purchase order with one scrap line and its refiner
// counterpart, on the given connection. A scrap line is a line whose
// bullion_id is null (the one-table model).
const anOrderWithScrap = async (c: PoolClient) => {
  const { rows: [metal] } = await c.query("SELECT id FROM metals.metals LIMIT 1");
  const { rows: [order] } = await c.query(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('purchase', 'Pending', nextval('orders.purchase_number_seq'))
     RETURNING id`
  );
  const { rows: [item] } = await c.query(
    `INSERT INTO orders.items (id, order_id, metal_id, pre_melt, purity, content, premium, quantity, confirmed, unit)
     VALUES (gen_random_uuid(), $1, $2, 10, 0.9, 9, 0.75, 1, false, 't oz') RETURNING id`,
    [order.id, metal.id]
  );
  // The engagement and the refiner counterpart, as creation writes them.
  const { rows: [engagement] } = await c.query(
    `INSERT INTO refiners.orders (order_id) VALUES ($1) RETURNING id`, [order.id]
  );
  await c.query(
    `INSERT INTO refiners.items (order_item_id, refiner_order_id, metal_id, quantity)
     VALUES ($1, $2, $3, 1)`,
    [item.id, engagement.id, metal.id]
  );
  return { orderId: order.id, itemId: item.id };
};

// The services open their own transactions, so these tests cannot run inside
// one - a rolled-back outer transaction would not see the service's commit.
// They clean up after themselves instead, scoped strictly to the fixture's
// ids.
const cleanup = async (c: PoolClient, { orderId }: { orderId: string }) => {
  await c.query(
    "DELETE FROM refiners.items WHERE order_item_id IN (SELECT id FROM orders.items WHERE order_id = $1)",
    [orderId]
  );
  await c.query("DELETE FROM refiners.spots WHERE order_id = $1", [orderId]);
  await c.query("DELETE FROM refiners.orders WHERE order_id = $1", [orderId]);
  for (const t of ["orders.items", "orders.spots", "orders.transactions", "orders.addresses"]) {
    await c.query(`DELETE FROM ${t} WHERE order_id = $1`, [orderId]);
  }
  await c.query("DELETE FROM orders.orders WHERE id = $1", [orderId]);
};

// ===========================================================================
// A PURCHASE BULLION LINE PRICES FROM THE RATES TABLE (Jacob, 2026-09-03)
// ===========================================================================
//
// "PURCHASE BULLION DOES NOT take its product bid premium. It comes from rates
// as well." createLine used to write NULL and leave the sums to fall back to
// the catalogue's own figure; it now writes the band's bullion_pct, and the
// order's SCRAP is re-tiered by the same combined total in the same breath.

// A purchase order with nothing on it, and the engagement row createLine needs
// to mirror a new line to the refiner.
const anEmptyGoldOrder = async (c: PoolClient) => {
  const { rows: [order] } = await c.query(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('purchase', 'Pending', nextval('orders.purchase_number_seq'))
     RETURNING id`
  );
  await c.query(`INSERT INTO refiners.orders (order_id) VALUES ($1)`, [order.id]);
  return { orderId: order.id };
};

// A gold product whose OWN bid_premium differs from the band its content
// earns, so neither assertion below can pass by coincidence.
const aGoldProductOffItsBand = async (c: PoolClient) => {
  const { rows } = await c.query(
    `SELECT b.id, b.content, b.bid_premium, band.bullion_pct
       FROM products.bullion b
       JOIN metals.metals m ON m.id = b.metal_id
       CROSS JOIN LATERAL (
         SELECT r.bullion_pct FROM rates.rates r
          WHERE r.metal_id = b.metal_id
            AND b.content >= r.min_qty
            AND (r.max_qty IS NULL OR b.content <= r.max_qty)
          ORDER BY r.min_qty LIMIT 1
       ) band
      WHERE m.name = 'Gold' AND b.content IS NOT NULL
        AND b.bid_premium IS DISTINCT FROM band.bullion_pct
      ORDER BY b.content
      LIMIT 1`
  );
  assert.ok(
    rows[0],
    "no gold product's bid_premium differs from its band - this check would be vacuous"
  );
  return rows[0];
};

// The band a given TOTAL of a metal earns, resolved the way getRateBand does.
const bandFor = async (c: PoolClient, metal: string, total: number) => {
  const { rows } = await c.query(
    `SELECT r.scrap_pct, r.bullion_pct FROM rates.rates r
       JOIN metals.metals m ON m.id = r.metal_id
      WHERE m.name = $1 AND $2::numeric >= r.min_qty
        AND (r.max_qty IS NULL OR $2::numeric <= r.max_qty)
      ORDER BY r.min_qty LIMIT 1`,
    [metal, total]
  );
  assert.ok(rows[0], `no ${metal} band covers ${total} - the check would be vacuous`);
  return rows[0];
};

test("a new bullion line is born at its rate band, not at the product's bid premium", async () => {
  const fixture = await anEmptyGoldOrder(client);
  try {
    const product = await aGoldProductOffItsBand(client);

    const created = await orders.createLine(fixture.orderId, { bullion_id: product.id });

    // The line CREATED carries it - createLine used to answer with the null it
    // inserted, before the re-tier that follows had written the real premium.
    assert.equal(
      Number(created.premium), Number(product.bullion_pct),
      "the new bullion line did not come back at its band"
    );
    assert.notEqual(
      Number(created.premium), Number(product.bid_premium),
      "the product's own bid_premium reached the order"
    );

    const { rows: [stored] } = await client.query(
      "SELECT premium FROM orders.items WHERE id = $1", [created.id]
    );
    assert.equal(Number(stored.premium), Number(product.bullion_pct));
  } finally {
    await cleanup(client, fixture);
  }
});

// ONE PARCEL OF METAL, ONE TIER. The scrap already on the order and the
// bullion being added are the same metal, so the band is read at their
// COMBINED content - and each line then takes its own column of it.
test("adding bullion re-tiers the order's scrap by their combined content", async () => {
  const { rows: [gold] } = await client.query(
    "SELECT id FROM metals.metals WHERE name = 'Gold'"
  );
  const { rows: [order] } = await client.query(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('purchase', 'Pending', nextval('orders.purchase_number_seq'))
     RETURNING id`
  );
  const fixture = { orderId: order.id };
  try {
    await client.query(`INSERT INTO refiners.orders (order_id) VALUES ($1)`, [order.id]);
    const { rows: [scrap] } = await client.query(
      `INSERT INTO orders.items
         (id, order_id, metal_id, pre_melt, purity, content, premium, quantity, confirmed, unit)
       VALUES (gen_random_uuid(), $1, $2, 5, 0.9, 4.5, 0.75, 1, false, 't oz')
       RETURNING id`,
      [order.id, gold.id]
    );

    const product = await aGoldProductOffItsBand(client);
    const created = await orders.createLine(order.id, { bullion_id: product.id });

    const total = 4.5 + Number(product.content);
    const band = await bandFor(client, "Gold", total);

    const { rows: [scrapNow] } = await client.query(
      "SELECT premium FROM orders.items WHERE id = $1", [scrap.id]
    );
    assert.equal(
      Number(scrapNow.premium), Number(band.scrap_pct),
      "the scrap was not re-tiered by the total the bullion added to"
    );
    assert.equal(
      Number(created.premium), Number(band.bullion_pct),
      "the bullion line did not take the same band's bullion column"
    );
  } finally {
    await cleanup(client, fixture);
  }
});

test("deleting a line removes it and its refiner counterpart together", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await orders.removeLine(fixture.itemId);

    const item = await client.query("SELECT 1 FROM orders.items WHERE id = $1", [fixture.itemId]);
    const refiner = await client.query(
      "SELECT 1 FROM refiners.items WHERE order_item_id = $1", [fixture.itemId]
    );
    assert.equal(item.rows.length, 0, "the order line survived");
    assert.equal(refiner.rows.length, 0, "the refiner counterpart survived the cascade");
  } finally {
    await cleanup(client, fixture);
  }
});

// THE ORDER IS THE ROW'S, NEVER THE REQUEST'S. The delete is guarded by the
// order id, and the id comes from the line itself - so a caller cannot name a
// line and an order that do not go together, and a line that names nothing is a
// 404 rather than a delete on an id alone (the exchange behaviour this replaced).
test("a line that does not exist is refused and nothing is deleted", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await assert.rejects(
      () => orders.removeLine("00000000-0000-4000-8000-000000000000"),
      /no order item/
    );
    const item = await client.query("SELECT 1 FROM orders.items WHERE id = $1", [fixture.itemId]);
    assert.equal(item.rows.length, 1, "a refused delete removed a different line");
  } finally {
    await cleanup(client, fixture);
  }
});

// ONE ROW, ONE PATCH (D214 item 11). The body was `{scrap: {premium, scrap:
// {...}}}` - the admin drawer's document for ONE table, read through casts,
// with the REFINER's assay columns smuggled inside it. It is the line's own
// columns now, and `content` is still derived here rather than sent: two
// definitions of what content means is the defect that costs money.
test("editing a scrap line writes the weights it names and derives the content", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    const edited = await orders.editLine(fixture.itemId, {
      pre_melt: 10, post_melt: 8, purity: 0.5, unit: "t oz", premium: 0.82,
    });
    // THE PREMIUM IN THE DOCUMENT IS THE ADMIN'S OWN and survives: a re-tier
    // after an override would answer 200 having thrown the override away.

    assert.equal(Number(edited.content), 4, "8 post-melt at 0.5 purity");
    assert.equal(Number(edited.pre_melt), 10);
    assert.equal(Number(edited.premium), 0.82);

    const { rows: [item] } = await client.query(
      "SELECT content, premium FROM orders.items WHERE id = $1", [fixture.itemId]
    );
    assert.equal(Number(item.content), 4);
    assert.equal(Number(item.premium), 0.82);
  } finally {
    await cleanup(client, fixture);
  }
});

// A WEIGHTS-ONLY EDIT RE-TIERS THE ORDER, because the band is read at the
// order's TOTAL content of the metal and the weight just moved it.
test("a weights-only edit re-tiers the order's lines", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    const { rows: [before] } = await client.query(
      "SELECT premium FROM orders.items WHERE id = $1", [fixture.itemId]
    );
    const edited = await orders.editLine(fixture.itemId, { post_melt: 8, purity: 0.5 });
    const band = await bandFor(client, "Gold", Number(edited.content));
    assert.equal(
      Number((await client.query(
        "SELECT premium FROM orders.items WHERE id = $1", [fixture.itemId]
      )).rows[0].premium),
      Number(band.scrap_pct),
      `the line was left at ${before.premium} rather than its band`
    );
  } finally {
    await cleanup(client, fixture);
  }
});

// A KEY THE DOCUMENT DOES NOT CARRY IS LEFT ALONE. The old write was a full
// replace defended by `?? null` on every field, so a partial edit CLEARED
// whatever it omitted; buildUpdate names only the keys present.
test("a partial edit leaves the columns it does not name alone", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    const { rows: [before] } = await client.query(
      "SELECT pre_melt, purity, unit FROM orders.items WHERE id = $1", [fixture.itemId]
    );

    await orders.editLine(fixture.itemId, { post_melt: 8 });

    const { rows: [after] } = await client.query(
      "SELECT pre_melt, post_melt, purity, unit FROM orders.items WHERE id = $1",
      [fixture.itemId]
    );
    assert.equal(Number(after.post_melt), 8);
    assert.equal(Number(after.pre_melt), Number(before.pre_melt), "pre_melt was cleared");
    assert.equal(Number(after.purity), Number(before.purity), "purity was cleared");
    assert.equal(after.unit, before.unit, "the unit was cleared");
  } finally {
    await cleanup(client, fixture);
  }
});

// AN EXPLICIT NULL CLEARS, which is the other half of the same contract - and
// the derived content follows the weight it was derived from.
test("an explicit null clears the column it names", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await orders.editLine(fixture.itemId, { post_melt: null });
    const { rows: [after] } = await client.query(
      "SELECT post_melt FROM orders.items WHERE id = $1", [fixture.itemId]
    );
    assert.equal(after.post_melt, null);
  } finally {
    await cleanup(client, fixture);
  }
});

// A DOCUMENT THAT NAMES NOTHING is a refusal: a no-op that reports success is
// worse than a refusal.
test("an empty patch is refused, and a line that does not exist is a 404", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await assert.rejects(() => orders.editLine(fixture.itemId, {}), /names no field/);
    await assert.rejects(
      () => orders.editLine("00000000-0000-4000-8000-000000000000", { premium: 1 }),
      /no order item/
    );
  } finally {
    await cleanup(client, fixture);
  }
});
