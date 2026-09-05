import * as fulfillments from "#db/fulfillments/repo.ts";
import * as methodService from "#domain/fulfillments/methods/service.ts";
import * as pickups from "#db/fulfillments/pickups/repo.ts";
import * as directs from "#db/fulfillments/directs/repo.ts";
import * as shipmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as parcel from "#domain/shipping/parcel.ts";
import * as handoffsService from "#domain/shipping/handoffs/service.ts";
import * as orders from "#db/orders/repo.ts";
import * as compose from "#domain/fulfillments/compose.ts";
import * as rules from "#domain/fulfillments/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  CarrierHandoff, Direction, Fulfillment, FulfillmentCategory, FulfillmentDirect,
  FulfillmentMethodRead, FulfillmentParcel, FulfillmentPatchBody, FulfillmentPickup,
  FulfillmentShipment, FulfillmentStep, FulfillmentView,
} from "@dorado/contracts";

async function detailsFor(
  rows: Fulfillment[], executor?: Executor
): Promise<{
  methods: Map<string, FulfillmentMethodRead>;
  pickups: Map<string, FulfillmentPickup>;
  directs: Map<string, FulfillmentDirect>;
  shipmentLinks: Map<string, FulfillmentShipment[]>;
  parcels: Map<string, FulfillmentParcel>;
  labelled: Set<string>;
  handoffs: CarrierHandoff[];
}> {
  const ids = rows.map((f) => f.id);
  const methods = await methodService.byId(executor);
  const p = await pickups.getMany(ids, executor);
  const d = await directs.getMany(ids, executor);
  const s = await shipmentLinks.getMany(ids, executor);
  const parcelRows = await parcel.getMany(s.map((l) => l.shipment_id), executor);
  return {
    methods,
    pickups: compose.byFulfillment(p),
    directs: compose.byFulfillment(d),
    shipmentLinks: compose.groupByFulfillment(s),
    parcels: new Map(parcelRows.map((row) => [row.id, row])),
    labelled: new Set(
      parcelRows.filter((row) => row.tracking_number != null).map((row) => row.id)
    ),
    handoffs: await handoffsService.getHandoffs(null, executor),
  };
}

async function composeOne(
  row: Fulfillment | undefined, executor?: Executor
): Promise<FulfillmentView | null> {
  if (!row) return null;
  return compose.compose(row, await detailsFor([row], executor));
}

export async function getForOrder(
  order_id: string,
  { userId, isAdmin = false }: { userId?: string; isAdmin?: boolean } = {},
  executor?: Executor
): Promise<FulfillmentView | null> {
  if (!isAdmin) {
    const owner = await orders.ownerOf(order_id, executor);
    if (!owner || owner !== userId) return null;
  }
  return await composeOne(await fulfillments.getByOrder(order_id, executor), executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<FulfillmentView | null> {
  return await composeOne(await fulfillments.getOne(id, executor), executor);
}

export async function getSchedule(
  filters: { from?: string; to?: string; employee_id?: string } = {},
  executor?: Executor
): Promise<FulfillmentView[]> {
  const p = await pickups.getScheduled(filters, executor);
  const d = await directs.getScheduled(filters, executor);

  const ids = [...new Set([...p, ...d].map((r) => r.fulfillment_id))];
  if (ids.length === 0) return [];

  const rows = await fulfillments.getMany(ids, executor);
  return compose.composeAll(rows, await detailsFor(rows, executor))
    .sort(rules.byStartTimeThenId);
}

async function createFulfillment(
  { order_id, method_id, status = "PENDING" }:
    { order_id: string; method_id: string; status?: string },
  executor?: Executor
): Promise<FulfillmentView> {
  rules.assertFulfillable(await orders.exists(order_id, executor), order_id);

  const made = await fulfillments.create(
    { order_id, method_id, status }, executor
  );
  const row = made ?? (await fulfillments.getByOrder(order_id, executor));
  const view = await composeOne(row, executor);
  rules.assertComposed(view, order_id);
  return view;
}

export async function createDraft(
  { method_id, direction }: { method_id: string; direction: Direction },
  executor?: Executor
): Promise<FulfillmentView> {
  await methodService.assertOffered({ method_id, direction }, executor);
  const method = await methodService.getOne(method_id, executor);
  rules.assertMethod(method, method_id);

  const row = await fulfillments.createDraft({ method_id }, executor);
  await ensureDetail(row.id, method.category, direction, executor);
  const view = await composeOne(row, executor);
  rules.assertComposed(view, row.id);
  return view;
}

async function ensureDetail(
  fulfillment_id: string, category: FulfillmentCategory, direction: Direction,
  executor?: Executor
): Promise<void> {
  if (category === "SHIPMENT") {
    if (await shipmentLinks.existsFor(fulfillment_id, executor)) return;
    const shipment_id = await parcel.createShell(
      direction === "sale" ? "Outbound" : "Inbound", executor
    );
    await shipmentLinks.create(
      { fulfillment_id, shipment_id }, executor
    );
    return;
  }
  if (category === "PICKUP") {
    if (await pickups.getFor(fulfillment_id, executor)) return;
    await pickups.create({ fulfillment_id }, executor);
    return;
  }
  if (await directs.getFor(fulfillment_id, executor)) return;
  await directs.create({ fulfillment_id }, executor);
}

export async function patchChoices(
  id: string, body: FulfillmentPatchBody, executor?: Executor
): Promise<FulfillmentView> {
  const row = await fulfillments.getOne(id, executor);
  rules.assertFulfillment(row, id);
  const method = await methodService.getOne(row.method_id, executor);
  rules.assertMethod(method, row.method_id);

  if ("shipment" in body) {
    rules.assertChoicesMatchCategory(method.category, "SHIPMENT", id);
    const [link] = await shipmentLinks.getFor(id, executor);
    rules.assertParcel(link, id);
    await parcel.applyChoices(link.shipment_id, body.shipment, executor);
  } else if ("pickup" in body) {
    rules.assertChoicesMatchCategory(method.category, "PICKUP", id);
    rules.assertTimestamp(body.pickup.start_time);
    await pickups.update(id, body.pickup, executor);
  } else {
    rules.assertChoicesMatchCategory(method.category, "DIRECT", id);
    rules.assertTimestamp(body.direct.start_time);
    await directs.update(id, body.direct, executor);
  }

  return await recompose(id, executor);
}

export async function missing(
  fulfillment_id: string, executor?: Executor
): Promise<FulfillmentStep[]> {
  return (await getById(fulfillment_id, executor))?.missing ?? [];
}

export async function addressIdOf(
  fulfillment_id: string, executor?: Executor
): Promise<string | null> {
  const view = await getById(fulfillment_id, executor);
  if (!view) return null;
  if (view.method.category === "SHIPMENT") return view.parcel?.shipper_address_id ?? null;
  if (view.method.category === "PICKUP") return view.pickup?.pickup_address_id ?? null;
  return null;
}

export async function shipmentIdOf(
  fulfillment_id: string, executor?: Executor
): Promise<string | null> {
  const [link] = await shipmentLinks.getFor(fulfillment_id, executor);
  return link?.shipment_id ?? null;
}

export async function orderOwnerOf(
  fulfillment_id: string, executor?: Executor
): Promise<string | null> {
  const row = await fulfillments.getOne(fulfillment_id, executor);
  if (!row?.order_id) return null;
  return (await orders.ownerOf(row.order_id, executor)) ?? null;
}

export async function attachToOrder(
  fulfillment_id: string, order_id: string, executor?: Executor
): Promise<FulfillmentView> {
  rules.assertFulfillable(await orders.exists(order_id, executor), order_id);
  const changed = await fulfillments.update(fulfillment_id, { order_id }, executor);
  rules.assertDraft(changed, fulfillment_id);
  return await recompose(fulfillment_id, executor);
}

async function recompose(id: string, executor?: Executor): Promise<FulfillmentView> {
  const row = await getById(id, executor);
  rules.assertComposed(row, id);
  return row;
}

export async function choose(
  { order_id, method_id, direction }:
    { order_id: string; method_id: string; direction: Direction },
  executor?: Executor
): Promise<FulfillmentView> {
  await methodService.assertOffered({ method_id, direction }, executor);
  return await createFulfillment({ order_id, method_id }, executor);
}

export async function chooseById(
  { order_id, method_id }: { order_id: string; method_id: string },
  executor?: Executor
): Promise<FulfillmentView> {
  return await createFulfillment({ order_id, method_id }, executor);
}

export async function chooseDefault(
  { order_id, direction, category = "SHIPMENT" }:
    { order_id: string; direction: Direction; category?: FulfillmentCategory },
  executor?: Executor
): Promise<FulfillmentView> {
  const method = await methodService.getDefault({ direction, category }, executor);
  return await createFulfillment({ order_id, method_id: method.id }, executor);
}

export async function setStatus(
  { id, status }: { id: string; status: string },
  executor?: Executor
): Promise<FulfillmentView | null> {
  const changed = await fulfillments.update(id, { status }, executor);
  if (!changed) return null;
  return await getById(id, executor);
}

export async function setMethod(
  { id, method_id }: { id: string; method_id: string },
  executor?: Executor
): Promise<FulfillmentView> {
  const target = await methodService.getOne(method_id, executor);
  rules.assertMethod(target, method_id);

  const current = await fulfillments.getOne(id, executor);
  rules.assertFulfillment(current, id);

  const currentMethod = await methodService.getOne(current.method_id, executor);
  if (currentMethod) {
    const view = await getById(id, executor);
    rules.assertMovable(currentMethod.category, target.category, {
      hasShipment: view?.actions.categories.length === 1,
      id,
    });
  }

  await fulfillments.update(id, { method_id }, executor);

  if (target.category !== "PICKUP") await pickups.remove(id, executor);
  if (target.category !== "DIRECT") await directs.remove(id, executor);
  await ensureDetail(id, target.category, target.direction ?? "purchase", executor);

  return await recompose(id, executor);
}

export async function assertCategory(
  fulfillment_id: string, category: FulfillmentCategory, executor?: Executor
): Promise<void> {
  const row = await fulfillments.getOne(fulfillment_id, executor);
  rules.assertFulfillment(row, fulfillment_id);
  const method = await methodService.getOne(row.method_id, executor);
  rules.assertMethod(method, row.method_id);
  rules.assertIsCategory(method.category, category, fulfillment_id);
}

export async function cancelSchedule(
  fulfillment_id: string, executor?: Executor
): Promise<FulfillmentView | null> {
  await pickups.remove(fulfillment_id, executor);
  await directs.remove(fulfillment_id, executor);
  return await getById(fulfillment_id, executor);
}
