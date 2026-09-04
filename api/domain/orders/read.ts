import * as ordersRepo from "#db/orders/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import * as productsRepo from "#db/products/repo.ts";
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";
import * as payoutsRepo from "#db/payouts/repo.ts";
import * as usersRepo from "#db/users/repo.ts";
import * as transactions from "#domain/orders/transactions/service.ts";
import * as rules from "#domain/orders/rules.ts";
import * as shipmentsRepo from "#db/shipping/shipments/repo.ts";
import * as pickupService from "#domain/shipping/pickups/service.ts";
import type { Order, OrderItem, OrderRead, OrderTotals } from "@dorado/contracts";
import type { BullionPublic, OrderView, OrderViewItem } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

function attach(rows: Order[], by: Map<string, OrderTotals>): OrderRead[] {
  const out: OrderRead[] = [];
  for (const row of rows) {
    out.push(Object.assign(row, { totals: by.get(row.id) ?? null }));
  }
  return out;
}

export async function list(
  narrowing: { direction?: string | null; user_id?: string | null },
  executor?: Executor
): Promise<Order[]> {
  const rows = await ordersRepo.list(narrowing, executor);
  if (rows.length === 0) return [];
  return attach(rows, await transactions.byOrderId(rows.map((o) => o.id), executor));
}

export async function getOne(
  id: string, executor?: Executor
): Promise<Order | null> {
  const row = await ordersRepo.getOne(id, executor);
  if (!row) return null;
  return attach([row], await transactions.byOrderId([row.id], executor))[0];
}

function withProduct(
  item: OrderItem, catalogue: Map<string, BullionPublic>
): OrderViewItem {
  return Object.assign(item, {
    product: item.bullion_id === null ? null : (catalogue.get(item.bullion_id) ?? null),
    payable: rules.payableOf(item),
    line_total: rules.lineTotalOf(item),
  });
}

export async function view(
  order_id: string, executor?: Executor
): Promise<OrderView | null> {
  const order = await ordersRepo.getOne(order_id, executor);
  if (!order) return null;

  const items = await itemsRepo.getFor(order_id, executor);
  const bullionIds = items.flatMap((i) => (i.bullion_id === null ? [] : [i.bullion_id]));
  const catalogue = new Map(
    (await productsRepo.listFor({ ids: bullionIds }, executor)).map((p) => [p.id, p])
  );

  const addressLink = await orderAddresses.getFor(order_id, executor);
  const pickups = await pickupService.getByOrder(order_id, executor);

  const totals = (await transactions.forOrder(order_id, executor)) ?? null;
  const address = addressLink
    ? ((await placeAddresses.getOne(addressLink.address_id, executor)) ?? null)
    : null;
  const shipments = await shipmentsRepo.getForOrder(order_id, executor);
  const payout = (await payoutsRepo.getFor(order_id, executor)) ?? null;

  return {
    order,
    totals,
    items: items.map((item) => withProduct(item, catalogue)),
    address,
    shipments,
    pickup: pickups[0] ?? null,
    payout,
    user: order.user_id === null
      ? null
      : ((await usersRepo.getOne(order.user_id, executor)) ?? null),
    actions: rules.actionsFor({
      direction: order.direction,
      status: order.status,
      order_sent: order.order_sent,
      tracking_updated: order.tracking_updated,
      hasAddress: address !== null,
      hasTotal: totals?.total != null,
      items,
      shipments,
      payoutMethod: payout?.method ?? null,
    }),
  };
}
