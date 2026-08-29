// Creating an order from a completed checkout.
//
// The last step of the decomposition: intake.js said what the customer asked
// for, intake.repo.js recorded it on their checkout, and this turns that
// checkout into an order, its items, its address snapshot and its fulfillment.
//
// NOTHING CALLS THIS YET. features/orders/service.ts still serves
// traffic and is untouched. This exists so the two can be compared before
// either is switched.
//
// Everything here takes an executor and threads it, so an order and its
// fulfillment are one transaction. Nothing in it touches the outside world -
// the label and the courier are the caller's problem and happen before the
// transaction opens, which is the shape createPurchaseOrder was rebuilt into.
import type { PoolClient } from "pg";

import query from "#shared/db/query.js";
import * as fulfillmentService from "#features/fulfillments/service.ts";
// The two bookings are their own resources (ruling 26b): checkout reaches
// fulfillments/pickups and fulfillments/directs directly, never through the
// fulfillments parent controller or service.
import * as fulfillmentPickups from "#features/fulfillments/pickups/service.ts";
import * as fulfillmentDirects from "#features/fulfillments/directs/service.ts";
import * as refinerOrders from "#features/refiners/orders/repo.ts";
import * as refinerItems from "#features/refiners/items/repo.ts";
import * as refinerSpots from "#features/refiners/spots/repo.ts";
import * as ratesRepo from "#features/rates/service.ts";
import { getRatePct, sumContentByMetal } from "#features/rates/utils/resolveRate.ts";

// Passing the executor is how each step below joins the caller's transaction.
// Every one of these is called from inside one, and an order that half-exists
// is the failure this is guarding.
type Executor = PoolClient | undefined;

// THE ORDER NUMBER COMES FROM EXCHANGE, and that is deliberate.
//
// orders.orders.number has a UNIQUE (direction, number) and NO default: the
// sequences live in exchange - purchase_orders_order_number_seq and
// sales_orders_order_number_seq - and the new schema was never given its own.
// While exchange is authoritative the two schemas share one numbering space,
// so drawing from its sequence is what keeps them in step. An independent
// counter here would hand out numbers exchange then hands out again.
//
// nextval advances a sequence and writes no row, so this is not a destructive
// write to exchange - it is the same call exchange makes on every insert.
//
// At promotion this has to change: the new schema needs its own sequence,
// seeded from max(number) + 1 per direction. That is a migration to write when
// ORDERS_SOURCE moves, and it belongs in PROMOTION.md rather than here, because
// seeding it now would fix a starting point that keeps moving.
async function nextNumber(direction: string, executor?: Executor): Promise<string> {
  const seq =
    direction === "purchase"
      ? "exchange.purchase_orders_order_number_seq"
      : "exchange.sales_orders_order_number_seq";
  const { rows } = await query(`SELECT nextval('${seq}') AS n`, [], executor);
  return rows[0].n;
}

// A snapshot of the address as it is now, plus a pointer back to the book row
// it came from. Copying is the whole point: editing an address afterwards must
// not silently rewrite where a parcel was sent, and deleting one from a book
// must not take the order's record of it away.
//
// The same shape 031_backfill_orders.sql produced for the historical orders, so
// a migrated order and a new one are indistinguishable.
async function snapshotAddress(
  order_id: string,
  source_address_id: string | null | undefined,
  executor?: Executor
) {
  if (!source_address_id) return null;
  const { rows } = await query(
    `INSERT INTO places.addresses (
       line_1, line_2, city, state, country, zip,
       country_code, phone_number, created_at, updated_at, is_valid, is_residential
     )
     SELECT a.line_1, a.line_2, a.city, a.state, a.country, a.zip,
            a.country_code, a.phone_number, a.created_at, a.updated_at,
            a.is_valid, coalesce(a.is_residential, false)
     FROM places.addresses a WHERE a.id = $1
     RETURNING id`,
    [source_address_id],
    executor
  );
  const snapshot_id = rows[0]?.id;
  if (!snapshot_id) return null;

  await query(
    `INSERT INTO orders.addresses (address_id, order_id, source_address_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (order_id) DO UPDATE SET
       address_id = EXCLUDED.address_id,
       source_address_id = EXCLUDED.source_address_id`,
    [snapshot_id, order_id, source_address_id],
    executor
  );
  return snapshot_id;
}

// orders.items.metal_id is NOT NULL, and a checkout item may carry only a
// bullion id. A product knows its own metal, so that is where it comes from;
// a scrap line already carries one.
//
// A line whose metal cannot be resolved is refused rather than skipped. An
// order silently missing a line is worse than an order that failed to be
// placed: the customer's metal arrives and nothing recorded that it was coming.
async function copyItems(order_id: string, checkout_id: string, executor?: Executor) {
  const { rows: items } = await query(
    `SELECT i.id, i.bullion_id,
            coalesce(i.metal_id, b.metal_id) AS metal_id,
            i.pre_melt, i.post_melt, i.purity, i.content, i.unit,
            i.premium, i.quantity
       FROM checkout.items i
       LEFT JOIN products.bullion b ON b.id = i.bullion_id
      WHERE i.checkout_id = $1
      ORDER BY i.created_at, i.id`,
    [checkout_id],
    executor
  );

  if (!items.length) throw new Error("a checkout with no items cannot become an order");

  const orphan = items.find((i) => !i.metal_id);
  if (orphan) {
    throw new Error(
      `checkout item ${orphan.id} has no metal, and neither does the product it ` +
        `names - orders.items.metal_id is NOT NULL, so this order cannot be placed`
    );
  }

  for (const i of items) {
    await query(
      `INSERT INTO orders.items (
         order_id, bullion_id, metal_id, pre_melt, post_melt, purity,
         content, unit, premium, quantity
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        order_id, i.bullion_id, i.metal_id, i.pre_melt, i.post_melt, i.purity,
        i.content, i.unit, i.premium, i.quantity ?? 1,
      ],
      executor
    );
  }
  return items.length;
}

// THE PREMIUM IS THE BUSINESS'S, NOT THE BROWSER'S.
//
// The block the frontend posts carries a bid_premium per line, and taking it at
// face value means the price a customer is paid comes from their own client.
// The legacy path has always overwritten it - "Source of truth: (re)price every
// scrap item's premium from the rates table" - and the new path did not, which
// is exactly what comparing the two on the same input surfaced: 0.80 submitted
// against 0.87 owed, on the same order.
//
// Same rule as retierOrderScrapPremiums in features/orders/service.ts,
// against orders.items instead of exchange.purchase_order_items, and using the
// same rates helpers so the tiering itself has one definition. Scrap only:
// bullion keeps its own per-product premium, which is what bullion_id IS NULL
// distinguishes.
//
// A no-op when there are no rate bands, which is the same thing the legacy
// helper does - an order placed with no rates configured keeps what it was
// given rather than being repriced to nothing.
async function retierScrapPremiums(order_id: string, executor?: Executor) {
  const rates = await ratesRepo.getAllRates();
  if (!rates?.length) return;

  const { rows: scrap } = await query(
    `SELECT i.id, m.name AS metal, i.content
       FROM orders.items i
       JOIN metals.metals m ON m.id = i.metal_id
      WHERE i.order_id = $1 AND i.bullion_id IS NULL`,
    [order_id],
    executor
  );
  if (!scrap.length) return;

  const totals = sumContentByMetal(
    scrap,
    (i) => i.metal,
    (i) => Number(i.content) || 0
  );

  for (const line of scrap) {
    const total = totals[String(line.metal ?? "").toLowerCase()] ?? 0;
    const pct = getRatePct(rates, line.metal, total, "scrap");
    if (pct == null) continue;
    await query(
      `UPDATE orders.items SET premium = $2 WHERE id = $1`,
      [line.id, pct],
      executor
    );
  }
}

// One quote per metal, frozen at the moment the order is placed. exchange calls
// this order_metals and writes a row per metal whether or not the order has any
// of it; this writes one per metal the order actually contains, because a spot
// for a metal nobody sold is a row that means nothing.
async function freezeSpots(order_id: string, executor?: Executor) {
  await query(
    `INSERT INTO orders.spots (order_id, metal_id, ask, bid, created_at, updated_at)
     SELECT DISTINCT $1::uuid, oi.metal_id, s.ask, s.bid, now(), now()
       FROM orders.items oi
       LEFT JOIN spots.spots s ON s.metal_id = oi.metal_id
      WHERE oi.order_id = $1::uuid`,
    [order_id],
    executor
  );
}

// The whole thing.
//
// `status` is the caller's, not this function's: what an order starts as is a
// business decision that differs by direction and by how it was placed, and
// exchange's default of "In Transit" only makes sense for a parcel in the post.
export async function createFromCheckout(
  {
    checkout_id,
    status,
    created_by_id = null,
    notes = null,
  }: {
    checkout_id: string;
    status: string;
    created_by_id?: string | null;
    notes?: string | null;
  },
  executor?: Executor
) {
  const { rows: found } = await query(
    `SELECT * FROM checkout.checkouts WHERE id = $1`,
    [checkout_id],
    executor
  );
  const checkout = found[0];
  if (!checkout) throw new Error(`no such checkout: ${checkout_id}`);

  const direction = checkout.direction;
  const number = await nextNumber(direction, executor);

  const { rows: created } = await query(
    `INSERT INTO orders.orders (
       user_id, direction, status, number, notes, review_created,
       created_by_id, created_at, updated_at
     ) VALUES ($1, $2::orders.direction, $3, $4, $5, false, $6, now(), now())
     RETURNING id`,
    [checkout.user_id, direction, status, number, notes, created_by_id],
    executor
  );
  const order_id = created[0].id;

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093): the refiner-side engagement
  // is born with the order, values NULL until a refinery is involved, and the
  // items and spots below get their refiner counterparts from it.
  await refinerOrders.ensureForOrder(order_id, executor);

  await copyItems(order_id, checkout_id, executor);
  await retierScrapPremiums(order_id, executor);
  await freezeSpots(order_id, executor);

  // The refiner counterparts (093's mirror completion, applied to new
  // traffic): one refiners.items row per customer line and one unquoted
  // refiners.spots row per frozen customer spot.
  await refinerItems.mirrorLinesForOrder(order_id, executor);
  await refinerSpots.coverFromOrderSpots(order_id, executor);

  // Whichever address the checkout recorded is the one the order is about. A
  // purchase records a shipper (the customer posts the metal), a sale a
  // recipient, a pickup a pickup address; only one is ever set.
  await snapshotAddress(
    order_id,
    checkout.shipper_address_id ??
      checkout.recipient_address_id ??
      checkout.pickup_address_id ??
      null,
    executor
  );

  // The fulfillment, through the service rather than the table, so the checks
  // that live there apply: the method has to belong to this direction, and a
  // booking has to match its method's category.
  const fulfillment = checkout.fulfillment_method_id
    ? await fulfillmentService.chooseById(
        { order_id, method_id: checkout.fulfillment_method_id, created_by_id },
        executor
      )
    : await fulfillmentService.chooseDefault(
        { order_id, direction, category: "SHIPMENT", created_by_id },
        executor
      );

  // BOTH of those are declared to return null, and everything below reads
  // .method off it straight away. Null is not reachable today: the only way
  // fulfillmentsRepo.create comes back empty is ON CONFLICT DO NOTHING, and it
  // falls back to getByOrder, which finds the row the conflict proves exists.
  //
  // Kept anyway, because of WHERE this runs. createFromCheckout is called
  // inside the caller's transaction, and a TypeError here would roll the whole
  // order back with "Cannot read properties of null" - which says nothing about
  // an order, a checkout or a fulfillment to whoever reads the log. The order
  // still rolls back either way; this only decides what it says on the way out.
  if (!fulfillment) {
    throw new Error(
      `order ${order_id} was created from checkout ${checkout_id} but no ` +
        `fulfillment came back for it - the order cannot be handed over and ` +
        `this transaction must not commit`
    );
  }

  if (fulfillment.method.category === "PICKUP" && checkout.pickup_address_id) {
    await fulfillmentPickups.schedule(
      {
        fulfillment_id: fulfillment.id,
        pickup_address_id: checkout.pickup_address_id,
        start_time: checkout.appointment_time ?? null,
      },
      executor
    );
  }

  if (fulfillment.method.category === "DIRECT" && checkout.appointment_location_id) {
    await fulfillmentDirects.schedule(
      {
        fulfillment_id: fulfillment.id,
        location_id: checkout.appointment_location_id,
        is_appointment: fulfillment.method.type === "APPOINTMENT",
        start_time: checkout.appointment_time ?? null,
      },
      executor
    );
  }

  return { order_id, number, fulfillment_id: fulfillment.id };
}
