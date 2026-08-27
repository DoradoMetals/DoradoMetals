// Reading a purchase order, from the tables it was split across.
//
// SEPARATE FROM service.ts ON PURPOSE, and only for as long as the restructure
// is in flight. features/purchase-orders/service.ts is 976 lines of order
// lifecycle - payouts, labels, emails - and none of it changes here.
// This file is the read half being rebuilt underneath it, so the two can be
// compared before anything is repointed. It folds into service.ts when the
// write paths follow.
//
// ONE READ PER TABLE, batched across every order in the answer. The query it
// replaces joined thirteen tables and grouped; this issues nine statements and
// assembles them, which is the same number of round trips whether one order is
// asked for or thirty.
import * as ordersRepo from "#features/orders/repo.ts";
import * as totals from "#features/orders/transactions/repo.ts";
import * as items from "#features/orders/items/repo.ts";
import * as orderAddresses from "#features/orders/addresses/repo.ts";
import * as refinerItems from "#features/refiners/items/repo.ts";
import * as payouts from "#features/payouts/repo.ts";
import * as shipmentService from "#features/shipping/shipments/service.ts";
import * as pickupService from "#features/shipping/pickups/service.ts";
import * as compose from "#features/purchase-orders/compose.ts";
import type { ItemContext, ComposedProduct } from "#features/purchase-orders/compose.ts";
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

// The bullion behind every line that has one, plus its metal's name.
async function productsById(
  ids: string[], executor?: Executor
): Promise<Map<string, ComposedProduct>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<ComposedProduct & { id: string }>(
    `SELECT b.id, b.name AS product_name, b.content, b.type AS product_type,
            b.image_front, b.image_back, b.bid_premium, b.ask_premium,
            b.variant_group, b.shadow_offset, bm.name AS metal_type
       FROM products.bullion b
       LEFT JOIN metals.metals bm ON bm.id = b.metal_id
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
async function assemble(
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
  // that owns it now rather than a cross-schema join.
  const out: Record<string, unknown>[] = [];
  for (const order of orderRows) {
    const shipment = await shipmentService.getByOrder(order.id, executor);
    const pickups = await pickupService.getByOrder(order.id, executor);
    const link = linkBy.get(order.id);

    out.push(
      compose.composeOrder({
        order,
        totals: totalBy.get(order.id),
        addressLink: link,
        items: (itemsBy.get(order.id) ?? []).map((i) => compose.composeItem(i, ctx, withActuals)),
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
): Promise<Parameters<typeof assemble>[0]> {
  const { rows } = await query<Parameters<typeof assemble>[0][number]>(
    `SELECT id, user_id, status, notes, created_at, updated_at,
            created_by, updated_by, number, review_created, spots_locked
       FROM orders.orders
      WHERE direction = 'purchase'${where ? ` AND ${where}` : ""}
      ORDER BY created_at DESC, id DESC`,
    params,
    executor
  );
  return rows;
}

export async function getAll(executor?: Executor): Promise<Record<string, unknown>[]> {
  // withActuals: the admin list, and the only read that carries the assay
  // figures a refiner reported.
  return await assemble(await purchaseOrders("", [], executor), true, executor);
}

export async function findAllByUser(
  userId: string, executor?: Executor
): Promise<Record<string, unknown>[]> {
  return await assemble(await purchaseOrders("user_id = $1", [userId], executor), false, executor);
}

export async function findById(
  id: string, executor?: Executor
): Promise<Record<string, unknown> | null> {
  const rows = await assemble(await purchaseOrders("id = $1", [id], executor), false, executor);
  return rows[0] ?? null;
}
