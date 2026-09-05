import * as orderRead from "#orders/read.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as spotsFeed from "#pricing/spots/service.ts";
import * as pricing from "#pricing/index.ts";
import * as rules from "#media/pdfs/rules.ts";
import type { DocumentLabels, PackageDetails } from "#media/pdfs/service.ts";
import type { OrderView } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

async function documentLabels(executor?: Executor): Promise<DocumentLabels> {
  const services = await servicesRepo.getAll(executor);
  return {
    metals: (await metalsRepo.list(executor)).map((metal) => metal.id),
    services: new Map(services.map((s) => [s.id, s.name])),
    packages: await packagesRepo.labelsById(executor),
  };
}

const inboundShipment = (order: OrderView): OrderView["shipments"][number] | null =>
  order.shipments.find((s) => s.direction !== "Return") ?? null;

async function metalBidsFor(
  order: OrderView, executor?: Executor
): Promise<ReadonlyMap<string, number | null>> {
  if (order.order.spots_locked) {
    const frozen = await orderSpots.getRowsFor(order.order.id, executor);
    return new Map(frozen.map((s) => [s.metal_id, s.bid]));
  }
  const live = await spotsFeed.getSpotPrices(executor);
  return new Map(live.map((s) => [s.id, s.bid]));
}

async function loadOrder(order_id: string, executor?: Executor): Promise<OrderView> {
  const order = await orderRead.view(order_id, executor);
  rules.assertOrder(order, order_id);
  return order;
}

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
    pricing: await pricing.priceOrder(order_id, executor),
    labels: await documentLabels(executor),
    package: await packageDetailsFor(order, executor),
  };
}

export async function returnPackingListInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor);
  return {
    order,
    pricing: await pricing.priceOrder(order_id, executor),
    labels: await documentLabels(executor),
  };
}

export async function invoiceInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor);
  return {
    order,
    pricing: await pricing.priceOrder(order_id, executor),
    bids: await metalBidsFor(order, executor),
    labels: await documentLabels(executor),
  };
}

export async function salesOrderInvoiceInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor);
  const frozen = await orderSpots.getRowsFor(order_id, executor);
  return {
    order,
    asks: new Map(frozen.map((s) => [s.metal_id, s.ask])),
    pricing: await pricing.priceOrder(order_id, executor),
    labels: await documentLabels(executor),
  };
}
