// Reading a sales order, from the tables it was split across.
//
// Same shape of work as features/purchase-orders/read.service.ts and a smaller
// job: three tables rather than four, no offer, no payout, no refiner numbers,
// no scrap.
//
// NOT WIRED IN YET. features/sales-orders/service.ts still reads through
// repo.js, and it stays that way until the write paths land beside it - reading
// the new schema while writing the old means a read cannot see a write that
// just happened, which is what broke when it was tried on purchase orders.
import * as totals from "#features/orders/transactions/repo.ts";
import * as items from "#features/orders/items/repo.ts";
import * as orderAddresses from "#features/orders/addresses/repo.ts";
import * as shipmentService from "#features/shipping/shipments/service.ts";
import * as compose from "#features/sales-orders/compose.ts";
import type { ComposedProduct } from "#features/purchase-orders/compose.ts";
import type { PoolClient } from "pg";
import query from "#shared/db/query.js";

type Executor = PoolClient | undefined;

type OrderRow = compose.SalesOrderParts["order"];

// The two reads with no restructured owner yet - the customer, because auth is
// blocked, and the address BOOK row, because features/places owns that pivot.
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

async function assemble(
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

  const out: Record<string, unknown>[] = [];
  for (const order of orderRows) {
    const shipment = await shipmentService.getByOrder(order.id, executor);
    const link = linkBy.get(order.id);
    out.push(
      compose.composeOrder({
        order,
        totals: totalBy.get(order.id),
        addressLink: link,
        items: (itemsBy.get(order.id) ?? []).map((i) => compose.composeItem(i, products)),
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
  const { rows } = await query<OrderRow>(
    `SELECT id, user_id, status, notes, created_at, updated_at,
            created_by, updated_by, number, review_created,
            order_sent, tracking_updated, refinery_id
       FROM orders.orders
      WHERE direction = 'sale'${where ? ` AND ${where}` : ""}
      ORDER BY created_at DESC, id DESC`,
    params,
    executor
  );
  return rows;
}

export async function getAll(executor?: Executor): Promise<Record<string, unknown>[]> {
  return await assemble(await salesOrders("", [], executor), executor);
}

export async function findAllByUser(
  userId: string, executor?: Executor
): Promise<Record<string, unknown>[]> {
  return await assemble(await salesOrders("user_id = $1", [userId], executor), executor);
}

export async function findById(
  id: string, executor?: Executor
): Promise<Record<string, unknown> | null> {
  const rows = await assemble(await salesOrders("id = $1", [id], executor), executor);
  return rows[0] ?? null;
}
