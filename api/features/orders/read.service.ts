// READING AN ORDER, from the tables it was split across - BOTH DIRECTIONS.
//
// Was features/purchase-orders/read.service.ts and
// features/sales-orders/read.service.ts. Direction is a COLUMN, so the four
// reference reads both directions need - the customer, the address book row,
// the bullion catalogue and the metal names - are ONE declaration here rather
// than two byte-identical copies that could drift.
//
// NOT features/orders/read.ts, which is a different thing and stays a
// different file: that one is the SLIM WIRE LIST (GET /api/orders), rows and
// totals and nothing nested. THIS is the API's own INTERNAL composed order -
// what pricing, the confirmation emails and the PDFs need, typed as
// ComposedOrder rather than as a contract.
//
// ONE READ PER TABLE, batched across every order in the answer, in both
// directions. The query it replaces joined thirteen tables and grouped; this
// issues nine statements and assembles them, which is the same number of round
// trips whether one order is asked for or thirty. D101 is why the shipment and
// the pickup hops are batched too.
//
// WHAT IS STILL READ FROM exchange, and why: the customer (auth is the one
// genuinely blocked feature) and the address BOOK row (features/places owns
// that pivot). Both are noted at their declarations.

import * as ordersRepo from "#features/orders/repo.ts";
import * as totals from "#features/orders/transactions/repo.ts";
import * as items from "#features/orders/items/repo.ts";
import * as orderAddresses from "#features/orders/addresses/repo.ts";
import * as refinerItems from "#features/refiners/items/repo.ts";
import * as payouts from "#features/payouts/repo.ts";
import * as shipmentService from "#features/shipping/shipments/service.ts";
import * as pickupService from "#features/shipping/pickups/service.ts";
import * as compose from "#features/orders/compose.ts";
import type { ItemContext, ComposedProduct } from "#features/orders/compose.ts";
import type { PoolClient } from "pg";
import query from "#shared/db/query.js";

type Executor = PoolClient | undefined;

// The two reads with no restructured owner yet - see the header of compose.ts.
// They are here rather than in a repo of their own because neither is a table
// this feature should own, and giving them a folder would suggest otherwise.
async function usersById(
  ids: string[], executor?: Executor
): Promise<Map<string, { user_id: string; user_name: string | null; user_email: string | null }>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; name: string | null; email: string | null }>(
    `SELECT id, name, email FROM exchange.users WHERE id = ANY($1::uuid[])`,
    [ids],
    executor
  );
  return new Map(
    rows.map((u) => [u.id, { user_id: u.id, user_name: u.name, user_email: u.email }])
  );
}

async function addressesById(ids: string[], executor?: Executor): Promise<Map<string, unknown>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string }>(
    `SELECT * FROM exchange.addresses WHERE id = ANY($1::uuid[])`,
    [ids],
    executor
  );
  return new Map(rows.map((a) => [a.id, a]));
}

// The bullion behind every line that has one, plus its metal's name and its
// mint's. The Next wire's product names (D84).
async function productsById(
  ids: string[], executor?: Executor
): Promise<Map<string, ComposedProduct>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<ComposedProduct & { id: string }>(
    `SELECT b.id, b.name, b.description, b.type, bm.name AS metal_type,
            b.content, b.gross, b.purity, b.bid_premium, b.ask_premium,
            b.image_front, b.image_back, mnt.name AS mint_name
       FROM products.bullion b
       LEFT JOIN metals.metals bm ON bm.id = b.metal_id
       LEFT JOIN products.mints mnt ON mnt.id = b.mint_id
      WHERE b.id = ANY($1::uuid[])`,
    [ids],
    executor
  );
  return new Map(rows.map((p) => [p.id, p]));
}

async function metalNames(executor?: Executor): Promise<Map<string, string>> {
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name FROM metals.metals`,
    [],
    executor
  );
  return new Map(rows.map((m) => [m.id, m.name]));
}

// Everything a set of orders needs, gathered once.
async function assemblePurchases(
  orderRows: { id: string; user_id: string | null; status: string | null; notes: string | null;
    created_at: Date | null; updated_at: Date | null; created_by: string | null;
    updated_by: string | null; number: number | null; review_created: boolean | null }[],
  withActuals: boolean,
  executor?: Executor
): Promise<Record<string, unknown>[]> {
  const ids = orderRows.map((o) => o.id);
  if (ids.length === 0) return [];

  const [totalRows, addrLinks, itemRows] = await Promise.all([
    totals.getMany(ids, executor),
    orderAddresses.getMany(ids, executor),
    items.getMany(ids, executor),
  ]);

  const bullionIds = [...new Set(itemRows.map((i) => i.bullion_id).filter((v): v is string => !!v))];

  const [products, metals, refiners, payoutRows, users, addressRows] = await Promise.all([
    productsById(bullionIds, executor),
    metalNames(executor),
    // ADMIN ONLY. A customer read never asks, which is why the decision is here
    // rather than a boolean threaded through a projection.
    withActuals
      ? refinerItems.byOrderItem(itemRows.map((i) => i.id), executor)
      : Promise.resolve(new Map()),
    payouts.getMany(ids, executor),
    usersById([...new Set(orderRows.map((o) => o.user_id).filter((v): v is string => !!v))], executor),
    addressesById(
      [...new Set(addrLinks.map((a) => a.source_address_id).filter((v): v is string => !!v))],
      executor
    ),
  ]);

  const ctx: ItemContext = { products, metalNames: metals, refinerItems: refiners };

  const totalBy = new Map(totalRows.map((r) => [r.order_id, r]));
  const linkBy = new Map(addrLinks.map((r) => [r.order_id, r]));
  const payoutBy = new Map(payoutRows.map((r) => [r.order_id, r]));
  const itemsBy = new Map<string, typeof itemRows>();
  for (const i of itemRows) {
    if (!itemsBy.has(i.order_id)) itemsBy.set(i.order_id, []);
    itemsBy.get(i.order_id)!.push(i);
  }

  // The shipment, the return shipment and the pickup, each through the service
  // that owns it now rather than a cross-schema join - AND EACH BATCHED ACROSS
  // EVERY ORDER, like every other read above.
  //
  // D101. These two were the only reads in this function still issued inside
  // the loop, and each fans out to about nine more. Against a database 178 ms
  // away that made a 48-order admin list ~214 round trips and 38 seconds,
  // versus 351 ms for the slim list - one hundred and eight times. The batched
  // forms walk the identical hops with `= ANY($1)` at each, so the composed
  // order is unchanged and the cost no longer scales with the answer.
  const [shipmentByOrder, pickupsByOrder] = await Promise.all([
    shipmentService.getByOrders(ids, executor),
    pickupService.getByOrders(ids, executor),
  ]);

  const out: Record<string, unknown>[] = [];
  for (const order of orderRows) {
    const shipment = shipmentByOrder.get(order.id) ?? null;
    const pickups = pickupsByOrder.get(order.id) ?? [];
    const link = linkBy.get(order.id);

    out.push(
      compose.composePurchaseOrder({
        order,
        totals: totalBy.get(order.id),
        addressLink: link,
        items: (itemsBy.get(order.id) ?? []).map((i) => compose.composePurchaseItem(i, ctx, withActuals)),
        address: link?.source_address_id ? (addressRows.get(link.source_address_id) ?? null) : null,
        // A purchase order has an INBOUND shipment and a RETURN one; the
        // service answers with the first shipment on the order, so the
        // direction decides which slot it lands in.
        shipment: shipment && shipment.type !== "Return" ? shipment : null,
        return_shipment: shipment && shipment.type === "Return" ? shipment : null,
        carrier_pickup: pickups[0] ?? null,
        payout: payoutBy.get(order.id) ?? null,
        user: users.get(order.user_id ?? "") ?? {
          user_id: order.user_id, user_name: null, user_email: null,
        },
      })
    );
  }
  return out;
}

// The order rows themselves. `direction = 'purchase'` is what makes this a
// purchase-order read of a table that holds both directions.
async function purchaseOrders(
  where: string, params: unknown[], executor?: Executor
): Promise<Parameters<typeof assemblePurchases>[0]> {
  const { rows } = await query<Parameters<typeof assemblePurchases>[0][number]>(
    `SELECT o.id, o.user_id, o.status, o.notes, o.created_at, o.updated_at,
            o.created_by, o.updated_by, o.number, o.review_created, o.spots_locked
       FROM orders.orders o
      WHERE o.direction = 'purchase'${where ? ` AND ${where}` : ""}
      ORDER BY o.created_at DESC, o.id DESC`,
    params,
    executor
  );
  return rows;
}

export async function getAllPurchases(executor?: Executor): Promise<Record<string, unknown>[]> {
  // withActuals: the admin list, and the only read that carries the assay
  // figures a refiner reported.
  return await assemblePurchases(await purchaseOrders("", [], executor), true, executor);
}

export async function findPurchasesByUser(
  userId: string, executor?: Executor
): Promise<Record<string, unknown>[]> {
  return await assemblePurchases(await purchaseOrders("o.user_id = $1", [userId], executor), false, executor);
}

export async function findPurchaseById(
  id: string, executor?: Executor
): Promise<Record<string, unknown> | null> {
  const rows = await assemblePurchases(await purchaseOrders("o.id = $1", [id], executor), false, executor);
  return rows[0] ?? null;
}

// ===========================================================================
// THE SALE DIRECTION
//
// A smaller job: three tables rather than four, no payout, no refiner numbers,
// no scrap, and no carrier pickup - so the shipment is the only loop-borne
// read there ever was here.
// ===========================================================================
type OrderRow = compose.SalesOrderParts["order"];

async function assembleSales(
  orderRows: OrderRow[], executor?: Executor
): Promise<Record<string, unknown>[]> {
  const ids = orderRows.map((o) => o.id);
  if (ids.length === 0) return [];

  const [totalRows, addrLinks, itemRows] = await Promise.all([
    totals.getMany(ids, executor),
    orderAddresses.getMany(ids, executor),
    items.getMany(ids, executor),
  ]);

  const [products, users, addressRows] = await Promise.all([
    productsById(
      [...new Set(itemRows.map((i) => i.bullion_id).filter((v): v is string => !!v))],
      executor
    ),
    usersById(
      [...new Set(orderRows.map((o) => o.user_id).filter((v): v is string => !!v))],
      executor
    ),
    addressesById(
      [...new Set(addrLinks.map((a) => a.source_address_id).filter((v): v is string => !!v))],
      executor
    ),
  ]);

  const totalBy = new Map(totalRows.map((r) => [r.order_id, r]));
  const linkBy = new Map(addrLinks.map((r) => [r.order_id, r]));
  const itemsBy = new Map<string, typeof itemRows>();
  for (const i of itemRows) {
    if (!itemsBy.has(i.order_id)) itemsBy.set(i.order_id, []);
    itemsBy.get(i.order_id)!.push(i);
  }

  // ONE READ FOR EVERY ORDER'S SHIPMENT, not one per order. D101 - see the
  // longer note in the purchase half above. Sales orders have
  // no pickup, so this is the only loop-borne read there was.
  const shipmentByOrder = await shipmentService.getByOrders(ids, executor);

  const out: Record<string, unknown>[] = [];
  for (const order of orderRows) {
    const shipment = shipmentByOrder.get(order.id) ?? null;
    const link = linkBy.get(order.id);
    out.push(
      compose.composeSalesOrder({
        order,
        totals: totalBy.get(order.id),
        addressLink: link,
        items: (itemsBy.get(order.id) ?? []).map((i) => compose.composeSalesItem(i, products)),
        address: link?.source_address_id ? (addressRows.get(link.source_address_id) ?? null) : null,
        shipment: shipment as Record<string, unknown> | null,
        user: users.get(order.user_id ?? "") ?? {
          user_id: order.user_id, user_name: null, user_email: null,
        },
      })
    );
  }
  return out;
}

// `direction = 'sale'` is what makes this a sales-order read of a table holding
// both directions.
async function salesOrders(
  where: string, params: unknown[], executor?: Executor
): Promise<OrderRow[]> {
  // WHICH REFINERY HAS THE METAL lives on the ENGAGEMENT - refiners.orders
  // (093), one row per order - not on the order row. orders.orders.refinery_id
  // was engagement data sitting on the order and dropped in 094; the alias
  // keeps the name compose.ts reads. The engagement's OWN id deliberately
  // does not ride along: the wire must not smear the join product onto the
  // order - engagement addressing is GET /orders/:orderId/refiners.
  const { rows } = await query<OrderRow>(
    `SELECT o.id, o.user_id, o.status, o.notes, o.created_at, o.updated_at,
            o.created_by, o.updated_by, o.number, o.review_created,
            o.order_sent, o.tracking_updated,
            ro.refiner_id AS refinery_id
       FROM orders.orders o
       LEFT JOIN refiners.orders ro ON ro.order_id = o.id
      WHERE o.direction = 'sale'${where ? ` AND ${where}` : ""}
      ORDER BY o.created_at DESC, o.id DESC`,
    params,
    executor
  );
  return rows;
}

export async function getAllSales(executor?: Executor): Promise<Record<string, unknown>[]> {
  return await assembleSales(await salesOrders("", [], executor), executor);
}

export async function findSalesByUser(
  userId: string, executor?: Executor
): Promise<Record<string, unknown>[]> {
  return await assembleSales(await salesOrders("o.user_id = $1", [userId], executor), executor);
}

export async function findSaleById(
  id: string, executor?: Executor
): Promise<Record<string, unknown> | null> {
  const rows = await assembleSales(await salesOrders("o.id = $1", [id], executor), executor);
  return rows[0] ?? null;
}
