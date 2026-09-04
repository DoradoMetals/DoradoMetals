// READING AN ORDER. Two shapes, and the difference between them is the whole
// point:
//
//   list / getOne   THE WIRE. An order is its orders.orders row plus `totals`
//                   and nothing else (Jacob, wave 3). Two statements for any
//                   number of orders.
//   view            THE DOCUMENT. One order put back together from the tables
//                   it is spread over - what the invoice, the packing list,
//                   the confirmation email and the bid-side pricing read.
//
// `view` REPLACES compose.ts AND read.service.ts (D214 item 12, Jacob: "we
// still have this compose file which sucks to see"). Those two were 1,078
// lines that built a purchase projection and a sale projection by hand,
// renamed columns on the way out (`net_charge` -> `shipping_charge`),
// fabricated all-null objects for absent rows, base64-wrapped a FedEx label
// into the response, and read `exchange.addresses` and `exchange.users` to
// finish the job. The shape is `OrderView` in @dorado/contracts now: generated
// row schemas, nested by table, absent is null, no renames.
//
// ONE READ PER REPO, and each is a plain CRUD read of the table that owns the
// rows. Nothing here joins across a schema.
import * as ordersRepo from "#db/orders/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import * as productsRepo from "#db/products/repo.ts";
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";
import * as payoutsRepo from "#db/payouts/repo.ts";
import * as usersRepo from "#db/users/repo.ts";
import * as transactions from "#domain/orders/transactions/service.ts";
import * as rules from "#domain/orders/rules.ts";
import * as shipmentOrderRead from "#domain/shipping/shipments/order-read.ts";
import * as pickupService from "#domain/shipping/pickups/service.ts";
import type { OrderRow } from "#db/orders/repo.ts";
import type { OrderItemRow } from "#db/orders/items/repo.ts";
import type { OrderTotalsRow } from "#domain/orders/transactions/service.ts";
import type { BullionPublic, OrderView, OrderViewItem } from "@dorado/contracts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

// `totals` is null for an order with no transactions row - a real state, and
// the contract declares it nullable for exactly those.
export type Order = OrderRow & { totals: OrderTotalsRow | null };


// Assigned onto the row rather than spread into a copy: the rows are this
// read's own and a copy is a second object to keep in step.
function attach(rows: OrderRow[], by: Map<string, OrderTotalsRow>): Order[] {
  const out: Order[] = [];
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

// A bullion line names its catalogue row; a scrap line's weights ARE its
// columns, so it names none. The two derived figures come with it so no screen
// multiplies a content by a premium ever again (rules.payableOf/lineTotalOf).
function withProduct(
  item: OrderItemRow, catalogue: Map<string, BullionPublic>
): OrderViewItem {
  return Object.assign(item, {
    product: item.bullion_id === null ? null : (catalogue.get(item.bullion_id) ?? null),
    payable: rules.payableOf(item),
    line_total: rules.lineTotalOf(item),
  });
}

// ONE ORDER, WHOLE. Null when there is no such order - the caller decides
// whether that is a 404 or a skipped email.
export async function view(
  order_id: string, executor?: Executor
): Promise<OrderView | null> {
  const order = await ordersRepo.getOne(order_id, executor);
  if (!order) return null;

  const items = await itemsRepo.getFor(order_id, executor);
  const bullionIds = items.flatMap((i) => (i.bullion_id === null ? [] : [i.bullion_id]));
  const catalogue = new Map(
    (await productsRepo.getByIds(bullionIds, executor)).map((p) => [p.id, p])
  );

  const addressLink = await orderAddresses.getFor(order_id, executor);
  const pickups = await pickupService.getByOrder(order_id, executor);

  const totals = (await transactions.forOrder(order_id, executor)) ?? null;
  // The SNAPSHOT, not the book row: where the parcel actually went.
  const address = addressLink
    ? ((await placeAddresses.getOne(addressLink.address_id, executor)) ?? null)
    : null;
  const shipments = await shipmentOrderRead.getForOrder(order_id, executor);
  const payout = (await payoutsRepo.getFor(order_id, executor)) ?? null;

  return {
    order,
    totals,
    items: items.map((item) => withProduct(item, catalogue)),
    address,
    shipments,
    // An order can be collected more than once (a first attempt, then a
    // rebooking); the document prints the one that was booked.
    pickup: pickups[0] ?? null,
    payout,
    user: order.user_id === null
      ? null
      : ((await usersRepo.getOne(order.user_id, executor)) ?? null),
    // WHAT MAY BE DONE TO IT, decided here and rendered there. Every input is
    // a row this read already holds, so it costs no extra statement.
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
