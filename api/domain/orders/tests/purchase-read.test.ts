// THE ORDER VIEW, purchase direction, against real Postgres.
//
// `read.service.ts` and `compose.ts` are gone (D214 item 12) and `view()` is
// what replaced them: generated row schemas nested by table, absent is null,
// no renames and no all-null objects. So the properties this file used to pin
// about the COMPOSED order are pinned about the view instead, and three of
// them changed on purpose:
//
//   a bullion line's all-null `scrap` object  ->  scrap columns ARE the line
//   a scrap line's all-null `product` object  ->  product is null
//   `scrap.purity_actual` on the admin read   ->  refiners.items, its own read
//
// The one that did NOT change is the one that matters most: only the last four
// digits of a bank account travel with an order.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as orderRead from "#domain/orders/read.ts";
import * as spotsRepo from "#db/orders/spots/repo.ts";

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

// Every purchase order in the database, as the view assembles it. The view is
// per-order by design - the composed read used to fetch them all so the admin
// list could carry the assay figures, and those are their own read now.
const purchaseIds = async (c: PoolClient): Promise<string[]> =>
  (
    await c.query<{ id: string }>(
      `SELECT id FROM orders.orders WHERE direction = 'purchase' ORDER BY created_at DESC, id DESC`
    )
  ).rows.map((r) => r.id);

const viewsOf = async (ids: string[]) => {
  const out = [];
  for (const id of ids) {
    const view = await orderRead.view(id);
    assert.ok(view, `order ${id} exists and the view could not read it`);
    out.push(view!);
  }
  return out;
};

// THE MEMBERS THE VIEW HAS, pinned against itself: a member silently
// disappearing from the assembly is what this catches, and there is no
// external schema that would notice.
const VIEW_MEMBERS = [
  "order", "totals", "items", "address", "shipments", "pickup", "payout", "user",
];

test("the order view carries exactly the members it declares", async () => {
  await inRollback(async (c: PoolClient) => {
    const [id] = await purchaseIds(c);
    assert.ok(id, "no purchase orders - this proves nothing");
    const view = await orderRead.view(id);
    assert.ok(view);
    assert.deepEqual(Object.keys(view!).sort(), [...VIEW_MEMBERS].sort());
  });
});

// AN ORDER'S ADDRESS IS THE SNAPSHOT IT TOOK, not the book row it was copied
// from. The composed read served the BOOK row (through the last exchange read
// on a live path); the view resolves the link's `address_id` and answers the
// places.addresses row the parcel actually went to.
test("the address is the snapshot the order took, not the book entry", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: links } = await c.query<{ order_id: string; address_id: string; source_address_id: string | null }>(
      `SELECT a.order_id, a.address_id, a.source_address_id
         FROM orders.addresses a
         JOIN orders.orders o ON o.id = a.order_id
        WHERE o.direction = 'purchase' LIMIT 5`
    );
    assert.ok(links.length, "no purchase order has an address, so this proves nothing");

    for (const link of links) {
      const view = await orderRead.view(link.order_id);
      assert.ok(view?.address, `order ${link.order_id} has an address link and no address`);
      assert.equal(view!.address!.id, link.address_id, "the view served a different row");
      if (link.source_address_id) {
        assert.notEqual(
          view!.address!.id,
          link.source_address_id,
          "the view served the BOOK row rather than the snapshot"
        );
      }
    }
  });
});

// THE SCRAP IS THE LINE (085), and the view says so: a scrap line's weights
// are its own columns and it names no product. The composed read gave every
// line BOTH objects, each full of nulls on the side it was not.
test("a line is a product line or a scrap line, and never both", async () => {
  await inRollback(async (c: PoolClient) => {
    const views = await viewsOf(await purchaseIds(c));
    const items = views.flatMap((v) => v.items);
    assert.ok(items.length, "no lines at all - this proves nothing");

    const bullion = items.filter((i) => i.bullion_id !== null);
    const scrap = items.filter((i) => i.bullion_id === null);
    assert.ok(bullion.length, "no bullion lines, so half of this proves nothing");
    assert.ok(scrap.length, "no scrap lines, so half of this proves nothing");

    for (const line of bullion) {
      assert.ok(line.product, "a bullion line came back with no product row");
      assert.equal(typeof line.product!.content, "number");
    }
    for (const line of scrap) {
      assert.equal(line.product, null, "a scrap line carries a product object");
      assert.ok(line.metal_id, "orders.items.metal_id is NOT NULL");
    }
  });
});

// THE ASSAY FIGURES ARE NOT ON THE ORDER AT ALL any more. They were
// `scrap.purity_actual` and friends - four values of refiners.items, under
// different names, on a customer-shaped object, present on the admin read and
// absent on the customer's. They are their own rows now, keyed by the line,
// which is what makes the admin/customer split a ROUTE rather than a flag.
test("the refiner's assay figures are not members of an order line", async () => {
  await inRollback(async (c: PoolClient) => {
    const views = await viewsOf(await purchaseIds(c));
    const items = views.flatMap((v) => v.items);
    assert.ok(items.length, "no lines at all - this proves nothing");
    for (const line of items) {
      for (const leaked of ["purity_actual", "post_melt_actual", "content_actual", "refiner_premium"]) {
        assert.equal(leaked in line, false, `${leaked} is still riding on an order line`);
      }
    }
  });
});

// Only the last four digits of a bank account may travel with an order.
//
// THE FLOOR IS THE POINT OF THIS TEST, NOT DECORATION. Without it the whole
// assertion is `for (const o of []) {}` the moment no order in dev carries a
// payout - and it would report success while checking the single constraint
// this project puts above every other one.
test("no order view carries a full account or routing number", async () => {
  await inRollback(async (c: PoolClient) => {
    const views = await viewsOf(await purchaseIds(c));
    assert.ok(views.length > 0, "no orders came back - this would prove nothing");

    const withPayout = views.filter((v) => v.payout);
    assert.ok(
      withPayout.length > 0,
      "no order carries a payout, so nothing here is checking a bank detail"
    );

    for (const v of withPayout) {
      assert.equal("account_number" in v.payout!, false);
      assert.equal("routing_number" in v.payout!, false);
      assert.ok("account_last4" in v.payout!, "the last four did not travel");
    }
  });
});

// BOTH LEGS IN ONE ARRAY. An inbound label and a return label are two rows of
// one table that differ by `direction`, not two named slots.
test("the shipments are rows of one table, told apart by direction", async () => {
  await inRollback(async (c: PoolClient) => {
    const views = await viewsOf(await purchaseIds(c));
    const shipments = views.flatMap((v) => v.shipments);
    assert.ok(shipments.length, "no shipments at all, so this proves nothing");
    for (const s of shipments) {
      assert.ok(typeof s.direction === "string", "a shipment has no direction");
      assert.equal("shipping_charge" in s, false, "the composer's rename survived");
      assert.ok("cost" in s, "the shipment's own cost column is missing");
    }
  });
});

// direction is the whole point of the unified table. A sales order appearing in
// a purchase order read would be a serious leak between two customers' orders.
test("no sales order leaks into a purchase order list", async () => {
  await inRollback(async (c: PoolClient) => {
    const ids = (await orderRead.list({ direction: "purchase" }, c)).map((o) => o.id);
    const { rows } = await c.query(
      "SELECT id FROM orders.orders WHERE direction = 'sale' AND id = ANY($1)", [ids]
    );
    assert.deepEqual(rows, []);
  });
});

test("spot rows come back per metal with the shape the API returns", async () => {
  // The first order with spots, not merely the first order - and a floor so an
  // empty search cannot pass vacuously.
  let spots: Awaited<ReturnType<typeof spotsRepo.getFor>> = [];
  for (const id of await purchaseIds(client)) {
    spots = await spotsRepo.getFor(id);
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
    // Fingerprints the rows THAT EXIST BEFORE THE READ and proves none of them
    // changed or vanished. Concurrent inserts by other files are invisible to
    // it by construction, so it cannot flake - and it is stronger than a count,
    // because a count cannot see an in-place UPDATE.
    const snapshot = async () =>
      (await c.query(
        `SELECT id, md5(o::text) AS sum FROM orders.orders o ORDER BY id`
      )).rows;

    const before = await snapshot();
    assert.ok(before.length > 0, "fixture: orders.orders must not be empty");
    await viewsOf(await purchaseIds(c));
    const after = new Map((await snapshot()).map((r) => [r.id, r.sum]));

    for (const row of before) {
      assert.ok(after.has(row.id), `the read removed order ${row.id}`);
      assert.equal(after.get(row.id), row.sum, `the read modified order ${row.id}`);
    }
  });
});
