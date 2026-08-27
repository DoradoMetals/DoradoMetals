// Purchase order reads against real Postgres.
//
// A purchase order is four rows here where exchange kept one, and the response
// has to look identical either way. Most of what can go wrong is in the seams:
// an id that used to resolve somewhere and no longer does, an object that turns
// into null, a join that drops a row with no offer. Each test runs inside a
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as next from "#features/purchase-orders/repo.next.ts";
import * as exchange from "#features/purchase-orders/repo.exchange.js";

let client;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

test("an order carries the same columns it always did", async () => {
  const [a] = await exchange.getAll();
  const [b] = await next.getAll();
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
});

// The one that would take checkout down. The frontend reads address.id off the
// order and posts it back; the API resolves it against exchange.addresses.
// orders.addresses points at a snapshot with a different id, so the read has to
// return the address-book id it was taken from.
test("the address id still resolves in exchange.addresses", async () => {
  await inRollback(async (c) => {
    const withAddress = (await next.getAll()).filter((o) => o.address_id);
    assert.ok(withAddress.length, "no order had an address, so this proves nothing");
    for (const o of withAddress) {
      const { rows } = await c.query(
        "SELECT 1 FROM exchange.addresses WHERE id = $1", [o.address_id]
      );
      assert.equal(rows.length, 1, `address_id ${o.address_id} does not resolve`);
      assert.equal(o.address.id, o.address_id, "address.id disagrees with address_id");
    }
  });
});

// exchange LEFT JOINs scrap and builds the object regardless, so a bullion line
// already carries a scrap object full of nulls. Returning null instead would
// make item.scrap.content throw where it used to give undefined.
test("a bullion line carries a scrap object of nulls, not null", async () => {
  const items = (await next.getAll()).flatMap((o) => o.order_items);
  const bullion = items.filter((i) => i.item_type === "product");
  assert.ok(bullion.length, "no bullion lines, so this proves nothing");
  for (const i of bullion) {
    assert.notEqual(i.scrap, null, "scrap object was null on a bullion line");
    assert.equal(i.scrap.content, null);
    assert.equal(i.scrap.metal, null);
  }
});

test("a scrap line carries its weights and its metal name", async () => {
  const scrap = (await next.getAll())
    .flatMap((o) => o.order_items)
    .filter((i) => i.item_type === "scrap");
  assert.ok(scrap.length);
  for (const i of scrap) {
    assert.equal(typeof i.scrap.content, "number");
    assert.equal(typeof i.scrap.metal, "string");
  }
});

// The assay figures are admin-only: getAll passes withActuals and the
// customer-facing lookups do not. Leaking them would be a change in what a
// customer can see.
test("the assay actuals appear for admin and not for a customer", async () => {
  const [adminOrder] = await next.getAll();
  const adminItem = adminOrder.order_items.find((i) => i.item_type === "scrap");
  if (adminItem) assert.ok("purity_actual" in adminItem.scrap);

  const customer = await next.findById(adminOrder.id);
  const customerItem = customer.order_items.find((i) => i.item_type === "scrap");
  if (customerItem) {
    assert.equal("purity_actual" in customerItem.scrap, false, "actuals leaked to a customer read");
  }
});

// Only the last four digits of a bank account may travel with an order.
//
// THE FLOOR IS THE POINT OF THIS TEST, NOT DECORATION. Without it the whole
// assertion is `for (const o of []) {}` the moment getAll returns nothing, or
// the moment no order in dev carries a payout - and it would report success
// while checking the single constraint this project puts above every other one.
// Found by audit:vacuous-tests.
test("no order response carries a full account or routing number", async () => {
  const orders = await next.getAll();
  assert.ok(orders.length > 0, "no orders came back - this would prove nothing");

  const withPayout = orders.filter((o) => o.payout);
  assert.ok(
    withPayout.length > 0,
    "no order carries a payout, so nothing here is checking a bank detail"
  );

  for (const o of withPayout) {
    assert.equal("account_number" in o.payout, false);
    assert.equal("routing_number" in o.payout, false);
  }
});

test("every purchase order comes back, including any without an offer", async () => {
  await inRollback(async (c) => {
    const { rows: [{ n }] } = await c.query(
      "SELECT count(*)::int n FROM orders.orders WHERE direction = 'purchase'"
    );
    assert.equal((await next.getAll()).length, n);
  });
});

// direction is the whole point of the unified table. A sales order appearing in
// a purchase order read would be a serious leak between two customers' orders.
test("no sales order leaks into a purchase order read", async () => {
  await inRollback(async (c) => {
    const ids = (await next.getAll()).map((o) => o.id);
    const { rows } = await c.query(
      "SELECT id FROM orders.orders WHERE direction = 'sale' AND id = ANY($1)", [ids]
    );
    assert.deepEqual(rows, []);
  });
});

// Four items have no quantity in exchange, and orders.items declared the column
// NOT NULL, which made the read return 1 where the API returns null. 039
// relaxed it; this pins that the null survives.
test("a line with no quantity still reads as null", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM exchange.purchase_order_items WHERE quantity IS NULL`
    );
    if (!rows[0].n) return;
    const nulls = (await next.getAll())
      .flatMap((o) => o.order_items)
      .filter((i) => i.quantity === null);
    assert.equal(nulls.length, rows[0].n);
  });
});

test("spot rows come back per metal with the shape the API returns", async () => {
  // The first order with spots, not merely the first order - and a floor so an
  // empty search cannot pass vacuously.
  let spots = [];
  for (const order of await next.getAll()) {
    spots = await next.findMetalsByOrderId(order.id);
    if (spots.length) break;
  }
  assert.ok(spots.length, "no purchase order has spot rows, so this asserts nothing");
  assert.deepEqual(Object.keys(spots[0]).sort(), [
    "ask_spot", "bid_spot", "created_at", "dollar_change", "id",
    "percent_change", "purchase_order_id", "type", "updated_at",
  ]);
  assert.deepEqual(spots.map((s) => s.type), [...spots.map((s) => s.type)].sort());
});

test("reads do not write", async () => {
  await inRollback(async (c) => {
    // The ORDERS advisory lock, because this assertion is "the count did not
    // change across my read" - under the dual default, other suite files
    // legitimately COMMIT orders concurrently, and a count taken twice across
    // that is a race, not a finding. Holding the lock serialises us with every
    // file that writes orders.
    await c.query("SELECT pg_advisory_xact_lock(4213)");
    const before = await c.query("SELECT count(*)::int n FROM orders.orders");
    await next.getAll();
    const after = await c.query("SELECT count(*)::int n FROM orders.orders");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});
