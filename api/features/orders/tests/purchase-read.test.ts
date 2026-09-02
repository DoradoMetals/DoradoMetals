// Purchase order reads against real Postgres - THE read since the pivot
// (ruling 8): read.service.ts, assembled from the per-table repos. Most of
// what can go wrong is in the seams: an id that used to resolve somewhere and
// no longer does, an object that turns into null, a join that drops a row.
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as readService from "#features/orders/read.service.ts";
import * as spotsRepo from "#features/orders/spots/repo.ts";

// WHAT THIS FILE ASSERTS ON, named. read.service.ts declares
// `Promise<Record<string, unknown>[]>` even though compose.ts produces a
// precise ComposedOrder - the composed type is discarded at the service
// boundary, so every field arrives as `unknown` and nothing downstream can
// read one. These declare the structural subset each assertion below touches,
// which is the honest thing: naming ComposedOrder would claim a shape the
// service does not promise.
type ReadItem = {
  item_type: string;
  quantity: number | null;
  scrap: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
};
type ReadOrder = {
  id: string;
  address_id: string | null;
  address: { address_id: string } | null;
  order_items: ReadItem[];
  payout: Record<string, unknown> | null;
};

const purchases = async (): Promise<ReadOrder[]> =>
  (await readService.getAllPurchases()) as ReadOrder[];

let client: PoolClient;

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

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// THE CONTRACT NO LONGER DESCRIBES THIS SHAPE (wave 3), and the pin changed
// with it. read.service.ts assembles the API's OWN internal order - what
// pricing, the confirmation email and the PDFs need - while the WIRE is the
// orders.orders row plus totals (packages/contracts' `Order`, checked by
// validate:wire and by features/orders/read.ts's own callers). So this pins
// the composed shape against ITSELF, as the explicit list compose.ts builds:
// a member silently disappearing from the assembly is exactly what
// verify:orders-decomposition and this catch, and there is no longer an
// external schema that would notice.
const COMPOSED_FIELDS = [
  "id", "user_id", "address_id", "status", "notes", "created_at", "updated_at",
  "created_by", "updated_by", "number", "spots_locked", "waive_shipping_fee",
  "waive_payout_fee", "shipping_paid", "review_created", "shipping_fee_actual",
  "pool_remediation", "pool_oz_deducted", "totals", "order_items", "address",
  "shipment", "return_shipment", "carrier_pickup", "payout", "user",
];

test("the composed order carries exactly the fields compose.ts builds", async () => {
  const [b] = await readService.getAllPurchases();
  assert.ok(b, "no orders came back - this proves nothing");
  assert.deepEqual(Object.keys(b).sort(), [...COMPOSED_FIELDS].sort());
});

// The one that would take checkout down. The frontend reads the order
// address's address_id (the BOOK id, per the snapshot shape) and posts it
// back; the API resolves it against exchange.addresses. orders.addresses
// points at a snapshot with a different id, so the read has to return the
// address-book id it was taken from.
test("the address id still resolves in exchange.addresses", async () => {
  await inRollback(async (c: PoolClient) => {
    const withAddress = (await purchases()).filter((o) => o.address_id);
    assert.ok(withAddress.length, "no order had an address, so this proves nothing");
    for (const o of withAddress) {
      const { rows } = await c.query(
        "SELECT 1 FROM exchange.addresses WHERE id = $1", [o.address_id]
      );
      assert.equal(rows.length, 1, `address_id ${o.address_id} does not resolve`);
      assert.ok(o.address, `order ${o.id} has an address_id and no address object`);
      assert.equal(o.address.address_id, o.address_id, "address.address_id disagrees with address_id");
    }
  });
});

// exchange LEFT JOINs scrap and builds the object regardless, so a bullion line
// already carries a scrap object full of nulls. Returning null instead would
// make item.scrap.content throw where it used to give undefined.
test("a bullion line carries a scrap object of nulls, not null", async () => {
  const items = (await purchases()).flatMap((o) => o.order_items);
  const bullion = items.filter((i) => i.item_type === "product");
  assert.ok(bullion.length, "no bullion lines, so this proves nothing");
  for (const i of bullion) {
    assert.ok(i.scrap, "scrap object was null on a bullion line");
    assert.equal(i.scrap.content, null);
    assert.equal(i.scrap.metal, null);
  }
});

test("a scrap line carries its weights and its metal name", async () => {
  const scrap = (await purchases())
    .flatMap((o) => o.order_items)
    .filter((i) => i.item_type === "scrap");
  assert.ok(scrap.length);
  for (const i of scrap) {
    assert.ok(i.scrap, "a scrap line came back with no scrap object");
    assert.equal(typeof i.scrap.content, "number");
    assert.equal(typeof i.scrap.metal, "string");
  }
});

// The assay figures are admin-only: getAll passes withActuals and the
// customer-facing lookups do not. Leaking them would be a change in what a
// customer can see.
test("the assay actuals appear for admin and not for a customer", async () => {
  const [adminOrder] = await purchases();
  const adminItem = adminOrder.order_items.find((i) => i.item_type === "scrap");
  if (adminItem?.scrap) assert.ok("purity_actual" in adminItem.scrap);

  const customer = (await readService.findPurchaseById(adminOrder.id)) as ReadOrder | null;
  // GUARDED. findPurchaseById returns `| null`, and this read the order_items
  // off it directly - an order the admin list named and the by-id read could
  // not find TypeError'd instead of saying so. Surfaced by the conversion.
  assert.ok(customer, `the admin list named order ${adminOrder.id} and findPurchaseById could not read it`);
  const customerItem = customer.order_items.find((i) => i.item_type === "scrap");
  if (customerItem?.scrap) {
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
  const orders = await purchases();
  assert.ok(orders.length > 0, "no orders came back - this would prove nothing");

  const withPayout = orders.filter((o) => o.payout);
  assert.ok(
    withPayout.length > 0,
    "no order carries a payout, so nothing here is checking a bank detail"
  );

  for (const o of withPayout) {
    assert.ok(o.payout, "filtered for a payout and got none");
    assert.equal("account_number" in o.payout, false);
    assert.equal("routing_number" in o.payout, false);
  }
});

test("every purchase order comes back, including any without an offer", async () => {
  await inRollback(async (c: PoolClient) => {
    // The count runs on this transaction's snapshot and getAll() reads
    // through the pool on another - under dual, a concurrent test committing
    // an order between the two makes them disagree by one. Same race as
    // "reads do not write" below; same lock.
    await c.query("SELECT pg_advisory_xact_lock(4213)");
    const { rows: [{ n }] } = await c.query(
      "SELECT count(*)::int n FROM orders.orders WHERE direction = 'purchase'"
    );
    assert.equal((await purchases()).length, n);
  });
});

// direction is the whole point of the unified table. A sales order appearing in
// a purchase order read would be a serious leak between two customers' orders.
test("no sales order leaks into a purchase order read", async () => {
  await inRollback(async (c: PoolClient) => {
    const ids = (await purchases()).map((o) => o.id);
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
  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM exchange.purchase_order_items WHERE quantity IS NULL`
    );
    if (!rows[0].n) return;
    const nulls = (await purchases())
      .flatMap((o) => o.order_items)
      .filter((i) => i.quantity === null);
    assert.equal(nulls.length, rows[0].n);
  });
});

test("spot rows come back per metal with the shape the API returns", async () => {
  // The first order with spots, not merely the first order - and a floor so an
  // empty search cannot pass vacuously.
  let spots: Awaited<ReturnType<typeof spotsRepo.getFor>> = [];
  for (const order of await purchases()) {
    spots = await spotsRepo.getFor(order.id);
    if (spots.length) break;
  }
  assert.ok(spots.length, "no purchase order has spot rows, so this asserts nothing");
  assert.deepEqual(Object.keys(spots[0]).sort(), [
    "ask", "bid", "created_at", "dollar_change", "id",
    "name", "percent_change", "purchase_order_id", "updated_at",
  ]);
  assert.deepEqual(spots.map((s) => s.name), [...spots.map((s) => s.name)].sort());
});

test("reads do not write", async () => {
  await inRollback(async (c: PoolClient) => {
    // WHAT THIS USED TO DO, AND WHY IT FLAKED: it took the ORDERS advisory lock
    // and asserted a count of orders.orders was unchanged across the read. It
    // failed 64 != 63 in a full run on 2026-08-29, and the lock was not the
    // problem - AN ADVISORY LOCK CANNOT SERIALISE A SERVICE THAT OPENS ITS OWN
    // POOL CONNECTION. Another file legitimately commits an order and cleans it
    // up again; a global count taken twice across that window is a race, and
    // the suite-wide audit:test-leaks (widened to all 18 schemas the same day)
    // confirmed the suite leaves nothing behind. So the count was measuring
    // other files' traffic, not this read.
    //
    // WHAT IT DOES NOW: fingerprints the rows THAT EXIST BEFORE THE READ and
    // proves none of them changed or vanished. Concurrent inserts by other
    // files are invisible to it by construction, so it cannot flake - and it is
    // STRICTLY STRONGER on the question it exists to answer, because a count
    // cannot see an in-place UPDATE. That is the same reason audit:test-leaks
    // hashes contents rather than counting rows: the tracking bug that deleted
    // five shipments' history also overwrote two columns in place.
    const snapshot = async () =>
      (await c.query(
        `SELECT id, md5(o::text) AS sum FROM orders.orders o ORDER BY id`
      )).rows;

    const before = await snapshot();
    assert.ok(before.length > 0, "fixture: orders.orders must not be empty");
    await readService.getAllPurchases();
    const after = new Map((await snapshot()).map((r) => [r.id, r.sum]));

    for (const row of before) {
      assert.ok(after.has(row.id), `the read removed order ${row.id}`);
      assert.equal(after.get(row.id), row.sum, `the read modified order ${row.id}`);
    }
  });
});
