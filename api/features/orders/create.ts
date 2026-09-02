// Creating an order from a completed checkout.
//
// The last step of the decomposition: intake.ts said what the customer asked
// for, intake.repo.ts recorded it on their checkout, and this turns that
// checkout into an order, its items, its address snapshot and its fulfillment.
//
// ORCHESTRATION AND DOMAIN GUARDS ONLY (Jacob, 2026-09-01: separation of
// concerns). Every statement lives with the table it touches - the checkout
// reads in features/checkout/repo.next.ts, the order row and its lines,
// spots and address link in this feature's own repos, the address freeze in
// features/places/addresses. This file decides WHAT happens and in what
// order, refuses what must not happen, and holds no SQL.
//
// NOTHING CALLS THIS YET. features/orders/service.ts still serves traffic
// and is untouched. This exists so the two can be compared before either is
// switched.
//
// Everything here takes an executor and threads it, so an order and its
// fulfillment are one transaction. Nothing in it touches the outside world -
// the label and the courier are the caller's problem and happen before the
// transaction opens, which is the shape createPurchaseOrder was rebuilt into.
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";

import * as ordersRepo from "#features/orders/repo.ts";
import * as orderItems from "#features/orders/items/repo.ts";
import * as orderSpots from "#features/orders/spots/repo.ts";
import * as orderAddresses from "#features/orders/addresses/repo.ts";
import * as checkoutRows from "#features/checkout/repo.next.ts";
import * as addressService from "#features/places/addresses/service.ts";
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

// orders.items.metal_id is NOT NULL, and a checkout item may carry only a
// bullion id - the repo read resolves the product's own metal onto the line.
//
// A line whose metal cannot be resolved is refused rather than skipped. An
// order silently missing a line is worse than an order that failed to be
// placed: the customer's metal arrives and nothing recorded that it was coming.
async function copyItems(order_id: string, checkout_id: string, executor?: Executor) {
  const items = await checkoutRows.getItemsForOrder(checkout_id, executor);

  if (!items.length) throw new Error("a checkout with no items cannot become an order");

  const orphan = items.find((i) => !i.metal_id);
  if (orphan) {
    throw new Error(
      `checkout item ${orphan.id} has no metal, and neither does the product it ` +
        `names - orders.items.metal_id is NOT NULL, so this order cannot be placed`
    );
  }

  for (const i of items) {
    await orderItems.create(
      randomUUID(),
      [
        order_id, i.bullion_id, i.metal_id as string,
        i.pre_melt, i.post_melt, i.purity, i.content,
        i.premium, i.quantity ?? 1,
        // Not confirmed and untaxed at placement: confirmation is the admin's
        // act, and a purchase pays no sales tax - the same defaults the
        // column definitions carry.
        false, 0, i.unit, null,
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
// bullion keeps its own per-product premium.
//
// A no-op when there are no rate bands, which is the same thing the legacy
// helper does - an order placed with no rates configured keeps what it was
// given rather than being repriced to nothing.
async function retierScrapPremiums(order_id: string, executor?: Executor) {
  const rates = await ratesRepo.getAllRates();
  if (!rates?.length) return;

  const scrap = await orderItems.scrapLinesFor(order_id, executor);
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
    await orderItems.setPremium(line.id, pct, executor);
  }
}

// A snapshot of the address as it is now, plus a pointer back to the book row
// it came from. Copying is the whole point: editing an address afterwards must
// not silently rewrite where a parcel was sent, and deleting one from a book
// must not take the order's record of it away.
async function snapshotAddress(
  order_id: string,
  source_address_id: string | null | undefined,
  executor?: Executor
) {
  if (!source_address_id) return null;
  const snapshot_id = await addressService.snapshot(source_address_id, executor);
  if (!snapshot_id) return null;
  await orderAddresses.link(randomUUID(), order_id, snapshot_id, source_address_id, executor);
  return snapshot_id;
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
  const checkout = await checkoutRows.getRowById(checkout_id, executor);
  if (!checkout) throw new Error(`no such checkout: ${checkout_id}`);

  const direction = checkout.direction;
  const { id: order_id, number } = await ordersRepo.createFromCheckout(
    checkout.user_id, direction, status, notes, created_by_id, executor
  );

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093): the refiner-side engagement
  // is born with the order, values NULL until a refinery is involved, and the
  // items and spots below get their refiner counterparts from it.
  await refinerOrders.ensureForOrder(order_id, executor);

  await copyItems(order_id, checkout_id, executor);
  await retierScrapPremiums(order_id, executor);
  await orderSpots.freezeFromItems(order_id, executor);

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

  // THE FULFILLMENT. The draft the checkout mutated is ATTACHED (D208 -
  // Jacob's flow: the fulfillment already exists and the order takes it);
  // a checkout with no draft falls back to the method column, and one with
  // neither to the direction's default. All three run through the service so
  // its checks apply: the method has to belong to this direction, and a
  // booking has to match its method's category.
  const fulfillment = checkout.fulfillment_id
    ? await fulfillmentService.attachDraft(
        { fulfillment_id: checkout.fulfillment_id, order_id, updated_by_id: created_by_id },
        executor
      )
    : checkout.fulfillment_method_id
      ? await fulfillmentService.chooseById(
          { order_id, method_id: checkout.fulfillment_method_id, created_by_id },
          executor
        )
      : await fulfillmentService.chooseDefault(
          { order_id, direction: direction as "purchase" | "sale", category: "SHIPMENT", created_by_id },
          executor
        );

  // The fallbacks are declared to return null, and everything below reads
  // .method off the result straight away. Null is not reachable today; kept
  // because a TypeError here would roll the whole order back with a message
  // that says nothing about an order, a checkout or a fulfillment.
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
