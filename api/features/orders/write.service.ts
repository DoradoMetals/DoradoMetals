// CREATING AN ORDER, both directions: the new schema and exchange, in one
// transaction.
//
// Was features/purchase-orders/write.service.ts and
// features/sales-orders/write.service.ts. This is the ONLY write either
// direction still owns as a whole-order operation: a status, a line, a quoted
// spot, the money, the refiner's numbers and the shipping charge each belong
// to the table they touch and live in that table's own repo, shared by both
// directions.
//
// THIS IS THE DUAL WRITE, and it does not wrap repo.dual.js's mirror - it
// replaces it for creation. The mirror re-derives an order from exchange after
// writing it there; these write both schemas DIRECTLY, from the same values,
// which is what lets exchange be deleted at the end rather than becoming the
// thing the new schema is defined in terms of.
//
// EVERY FUNCTION TAKES THE CALLER'S EXECUTOR AND THREADS IT. An order is
// created inside a transaction that also writes its lines and its scrap, or
// moves the customer's funds, writes a ledger entry, updates the state's
// collected sales tax and attaches a Stripe intent. A write that opened its
// own connection would commit while the rest rolled back.
//
// THE ID IS GENERATED HERE, in both directions, so the two schemas agree on it
// - and `number` comes back from the NEW-SCHEMA insert because it is drawn
// from exchange's sequence. Before that, exchange's column DEFAULT drew the
// shared sequence a second time and the two schemas held different numbers for
// the same order: the one find of the wave-1 parity ledger, pinned by
// tests/write.service.test.ts.
import { randomUUID } from "node:crypto";
import * as orders from "#features/orders/repo.ts";
import * as orderItems from "#features/orders/items/repo.ts";
import * as orderSpots from "#features/orders/spots/repo.ts";
import * as orderAddresses from "#features/orders/addresses/repo.ts";
import * as orderTransactions from "#features/orders/transactions/repo.ts";
import * as refinerOrders from "#features/refiners/orders/repo.ts";
import * as refinerItems from "#features/refiners/items/repo.ts";
import * as refinerSpots from "#features/refiners/spots/repo.ts";
import type { Flag } from "#features/orders/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

// ===========================================================================
// THE PURCHASE DIRECTION
// ===========================================================================

type NewPurchaseOrder = {
  userId: string;
  addressId: string | null;
  status: string;
  by?: string | null;
};

// TWO ROWS IN THE NEW SCHEMA, ONE IN EXCHANGE.
//
// OFFERS ARE GONE (086). This used to create an empty offer row alongside the
// order, because exchange held the offer fields as columns on the order and the
// new schema had split them onto orders.offers. That table no longer exists;
// spots_locked moved to orders.orders and is written with the order itself.
export async function insertPurchaseOrder(
  executor: Executor, { userId, addressId, status, by = null }: NewPurchaseOrder
): Promise<string> {
  const id = randomUUID();

  const { number } = await orders.create({ id, user_id: userId, direction: "purchase", status: status ?? "In Transit", created_by: by }, executor);

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093). The order gets its
  // refiners.orders row at birth, values NULL until the refinery reports -
  // the invariant the backfill established, maintained for new traffic.
  await refinerOrders.ensureForOrder(id, executor);

  return id;
}

// ===========================================================================
// THE SALE DIRECTION
// ===========================================================================

// What the order-creation path has always passed. exchange's names, because
// that is the shape every call site builds.
type OrderPrices = {
  order_total?: number | null;
  shipping_charge?: number | null;
  pre_charges_amount?: number | null;
  post_charges_amount?: number | null;
  subject_to_charges_amount?: number | null;
  item_total?: number | null;
  base_total?: number | null;
  charges_amount?: number | null;
  sales_tax?: number | null;
};

type NewSalesOrder = {
  user: { id: string; name?: string | null };
  status: string;
  sales_order: {
    address: { id: string };
    service?: { label?: string | null } | null;
    using_funds?: boolean | null;
  };
  orderPrices: OrderPrices;
};

// Creating a sales order is FIVE rows in the new schema and one in exchange.
export async function insertSalesOrder(
  executor: Executor, { user, status, sales_order, orderPrices }: NewSalesOrder
): Promise<string> {
  const id = randomUUID();
  const by = user.name ?? null;
  const p = orderPrices;

  const { number } = await orders.create({ id, user_id: user.id, direction: "sale", status: status ?? "Pending", created_by: by }, executor);

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093). A sales order gets its
  // refiners.orders row at birth, values NULL until a refinery is involved -
  // the invariant the backfill established, maintained for new traffic.
  await refinerOrders.ensureForOrder(id, executor);

  await orderTransactions.create(
    {
      order_id: id,
      total: p.order_total ?? null,
      shipping: p.shipping_charge ?? null,
      shipping_service: sales_order.service?.label ?? null,
      funds: p.pre_charges_amount ?? null,
      post_charges_amount: p.post_charges_amount ?? null,
      subject_to_charges_amount: p.subject_to_charges_amount ?? null,
      used_funds: sales_order.using_funds ?? null,
      items: p.item_total ?? null,
      base_total: p.base_total ?? null,
      surcharge: p.charges_amount ?? null,
      sales_tax: p.sales_tax ?? null,
      by,
    },
    executor
  );

  // The address LINK. Both ids are the address-book row today: the snapshot is
  // taken at checkout by features/orders/create.ts on the path that replaces
  // this one, and until then exchange records only the book id - so recording
  // it as both is the honest reading of what exchange holds, not an invention.
  await orderAddresses.link(
    { order_id: id, address_id: sales_order.address.id, source_address_id: sales_order.address.id },
    executor
  );


  return id;
}

// THE ITEM IS LOOSE ON PURPOSE. It arrives from the tax service as
// `Record<string, unknown> & { sales_tax_rate }` - a product row that has been
// through pricing and tax and has picked up fields along the way - so naming
// its shape here would be a claim about a value this file does not own.
// The four fields actually read are pulled out where they are used, and the
// two that MUST be present - the product id and its metal - are the ones the
// caller resolves and the ones that throw by name when missing.
type PricedItem = Record<string, unknown> & {
  id?: unknown;
  quantity?: unknown;
  ask_premium?: unknown;
  sales_tax_rate?: unknown;
  metal_id?: unknown;
};

const asNumber = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

// The lines. `price` is computed by the caller - calculateItemAsk reads the
// spot prices and the product's premium - and passed in, so the two schemas
// cannot disagree about what an item cost.
export async function insertSalesItems(
  executor: Executor,
  orderId: string,
  items: PricedItem[],
  priceOf: (item: PricedItem) => number | null,
  metalOf: (item: PricedItem) => string
): Promise<void> {
  for (const item of items) {
    const id = randomUUID();
    const price = priceOf(item);
    const product_id = typeof item.id === "string" ? item.id : null;
    const quantity = asNumber(item.quantity);
    const premium = asNumber(item.ask_premium);
    const tax_rate = asNumber(item.sales_tax_rate);

    // The canonical items statement (orders/items) - a sales line is bullion
    // with no weights, confirmed at birth, taxed at its quoted rate.
    await orderItems.create(
      {
        id, order_id: orderId, bullion_id: product_id, metal_id: metalOf(item),
        premium, quantity, confirmed: true,
        sales_tax_charged: tax_rate ?? 0, price,
      },
      executor
    );
  }

  // The refiner counterparts, one per line (093's mirror completion applied
  // to new traffic) - orders.items and refiners.items match counts by
  // construction, the invariant refiner-edits.test.js pins.
  await refinerItems.mirrorLinesForOrder(orderId, executor);
}

// The composed spot shape (`name` / `ask` / `bid`) - what getSpotPrices
// returns since D84 retired the legacy spellings.
type QuotedSpot = { name: string; ask?: number | null; bid?: number | null };

// The quoted spots. exchange keys them by metal NAME and the new schema by
// metal id, so the caller supplies the resolution - it already holds the map.
export async function insertSalesOrderMetals(
  orderId: string,
  spots: QuotedSpot[],
  metalIdOf: (name: string) => string | undefined,
  executor?: Executor
): Promise<void> {
  for (const spot of spots) {
    const metal_id = metalIdOf(spot.name);
    // A metal the quote names but the database does not have is skipped rather
    // than invented - the INSERT ... JOIN this replaces did the same by
    // matching no row.
    if (metal_id) {
      await orderSpots.create(
        { order_id: orderId, metal_id, ask: spot.ask ?? null, bid: spot.bid ?? null },
        executor
      );
    }
    // exchange.order_metals still calls the metal `type`; that spelling is the
    // COLUMN's (the exchange row's own spellings, D84), not the wire's.
  }

  // The refiner counterparts, unquoted (093's coverage invariant: no customer
  // spot without its refiner row).
  await refinerSpots.coverFromOrderSpots(orderId, executor);
}

export async function updateSalesStatus(
  order: { id: string }, status: string, by: string | null, executor?: Executor
): Promise<{ id: string } | undefined> {
  const written = await orders.update(order.id, { status, updated_by: by }, {}, executor);
  return written;
}

// The three workflow flags share one path because they are one operation with
// three targets - see the FLAGS note in repo.ts for why the column name can be
// substituted safely.
export async function setSalesFlag(
  id: string, flag: Flag, executor?: Executor
): Promise<{ id: string } | undefined> {
  const written = await orders.update(id, { [flag]: true }, {}, executor);
  return written;
}

export async function attachSupplierToOrder(
  id: string, supplier_id: string, executor?: Executor
): Promise<{ id: string; supplier_id: string | null } | undefined> {
  const row = await orders.setRefinery(id, supplier_id, executor);
  return row;
}
