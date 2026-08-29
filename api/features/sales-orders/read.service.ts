// Reading a sales order, from the tables it was split across.
//
// Same shape of work as features/purchase-orders/read.service.ts and a smaller
// job: three tables rather than four, no offer, no payout, no refiner numbers,
// no scrap.
//
// THE sales-order read: service.ts serves every list and lookup from here,
// against the new schema, while write.service.ts writes BOTH schemas - the
// reads and writes pivoted together, which is the sequencing lesson purchase
// orders learned the hard way.
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

  // ONE READ FOR EVERY ORDER'S SHIPMENT, not one per order. D101 - see the
  // longer note in features/purchase-orders/read.service.ts. Sales orders have
  // no pickup, so this is the only loop-borne read there was.
  const shipmentByOrder = await shipmentService.getByOrders(ids, executor);

  const out: Record<string, unknown>[] = [];
  for (const order of orderRows) {
    const shipment = shipmentByOrder.get(order.id) ?? null;
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

export async function getAll(executor?: Executor): Promise<Record<string, unknown>[]> {
  return await assemble(await salesOrders("", [], executor), executor);
}

export async function findAllByUser(
  userId: string, executor?: Executor
): Promise<Record<string, unknown>[]> {
  return await assemble(await salesOrders("o.user_id = $1", [userId], executor), executor);
}

export async function findById(
  id: string, executor?: Executor
): Promise<Record<string, unknown> | null> {
  const rows = await assemble(await salesOrders("o.id = $1", [id], executor), executor);
  return rows[0] ?? null;
}
