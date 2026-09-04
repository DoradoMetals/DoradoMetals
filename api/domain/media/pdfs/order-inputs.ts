// EVERY DOCUMENT'S INPUTS, LOADED BY ORDER ID (ruling 10, wave 3).
//
// "The frontend sends IDs - plus genuine user input - and gets data back."
// The four PDF routes were the last standing violation named in ruling 10:
// each POSTed the WHOLE composed order, plus the live spot feed, plus the
// package and the payout method, as its render body. So a customer's invoice
// was rendered from numbers the customer's browser supplied.
//
// The body is `{ order_id }` now and this is what fills the gap: one place
// that resolves an order's render inputs from the database, shared by the four
// documents and by the confirmation email's twin in domain/media/emails.
//
// THE READ IS `orders/read.ts` view() (D214 item 12). It used to be
// read.service.ts's composed order - a hand-built tree with renamed columns
// and all-null slots. Everything a template reads is now a row of the table
// that owns it, plus three label lookups and the quote the order prices at.
import * as orderRead from "#domain/orders/read.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
// The LIVE spot feed - the same read the pricing paths use (spots.spots).
import * as spotsFeed from "#domain/spots/service.ts";
import { inboundShipment, type Bids } from "#domain/pricing/service.ts";
import { NotFound } from "#shared/errors.ts";
import type { DocumentLabels, PackageDetails } from "#domain/media/pdfs/service.ts";
import type { OrderView } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

// The three name lookups every document shares, read once.
async function documentLabels(executor?: Executor): Promise<DocumentLabels> {
  const services = await servicesRepo.getAll(executor);
  return {
    metals: await metalsRepo.namesById(executor),
    services: new Map(services.map((s) => [s.id, s.name])),
    packages: await packagesRepo.labelsById(executor),
  };
}

// WHICH QUOTE THE DOCUMENT PRICES AT. A locked order is valued at the spots
// FROZEN onto it - that is what orders.spots exists for - and an unlocked one
// at today's feed, because its price is still an estimate. Keyed by metal_id
// both ways: the live feed's `id` IS the metal's id (domain/spots/compose.ts).
async function bidsFor(order: OrderView, executor?: Executor): Promise<Bids> {
  if (order.order.spots_locked) {
    const frozen = await orderSpots.getRowsFor(order.order.id, executor);
    return new Map(frozen.map((s) => [s.metal_id, s.bid]));
  }
  const live = await spotsFeed.getSpotPrices(executor);
  return new Map(live.map((s) => [s.id, s.bid]));
}

async function loadOrder(order_id: string, executor?: Executor): Promise<OrderView> {
  const order = await orderRead.view(order_id, executor);
  if (!order) throw new NotFound(`no order ${order_id}`);
  return order;
}

// The box the parcel was actually booked with. The browser used to guess it by
// matching a hard-coded option list against the shipment's package LABEL;
// shipping.shipments names the row by id and shipping.packages holds the label
// and the dimensions the packing list prints.
export async function packageDetailsFor(
  order: OrderView, executor?: Executor
): Promise<PackageDetails | null> {
  const package_id = inboundShipment(order)?.package_id ?? null;
  if (!package_id) return null;
  const box = await packagesRepo.getOne(package_id, executor);
  if (!box) return null;
  return {
    label: box.label,
    length: Number(box.length),
    width: Number(box.width),
    height: Number(box.height),
  };
}

export async function packingListInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor);
  return {
    order,
    bids: await bidsFor(order, executor),
    labels: await documentLabels(executor),
    package: await packageDetailsFor(order, executor),
  };
}

export async function returnPackingListInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor);
  return {
    order,
    bids: await bidsFor(order, executor),
    labels: await documentLabels(executor),
  };
}

export async function invoiceInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor);
  return {
    order,
    bids: await bidsFor(order, executor),
    labels: await documentLabels(executor),
  };
}

// A SALE QUOTES ASKS, NOT BIDS: it is what the customer was charged. The order
// froze them at checkout, so they come off orders.spots.
export async function salesOrderInvoiceInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor);
  const frozen = await orderSpots.getRowsFor(order_id, executor);
  return {
    order,
    asks: new Map(frozen.map((s) => [s.metal_id, s.ask])),
    labels: await documentLabels(executor),
  };
}
