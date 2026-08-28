// Writing a sales order: the new schema and exchange, in one transaction.
//
// This is the dual write, and it replaces repo.dual.js's mirror rather than
// wrapping it. The mirror re-derived the order from exchange after writing it
// there; this writes both directly, from the same values, which is what lets
// exchange be deleted at the end rather than becoming the thing the new schema
// is defined in terms of.
//
// EVERY FUNCTION TAKES THE CALLER'S EXECUTOR AND THREADS IT. Creating a sales
// order happens inside a transaction that also moves the customer's funds,
// writes a ledger entry, updates the state's collected sales tax and attaches a
// Stripe intent. A write that opened its own connection would commit while the
// rest rolled back.
import { randomUUID } from "node:crypto";
import * as orders from "#features/sales-orders/repo.ts";
import * as legacy from "#features/sales-orders/legacy.repo.ts";
import * as refinerOrders from "#features/refiners/orders/repo.ts";
import * as refinerItems from "#features/refiners/items/repo.ts";
import * as refinerSpots from "#features/refiners/spots/repo.ts";
import type { Flag, Executor } from "#features/sales-orders/repo.ts";

// What the order-creation path has always passed. exchange's names, because
// that is the shape every call site builds.
export type OrderPrices = {
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

export type NewOrder = {
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
//
// The id is generated here so both schemas agree on it, and `number` comes back
// from the new-schema insert because it is drawn from exchange's sequence -
// the two share one numbering space while both are live.
export async function insertOrder(
  executor: Executor, { user, status, sales_order, orderPrices }: NewOrder
): Promise<string> {
  const id = randomUUID();
  const by = user.name ?? null;
  const p = orderPrices;

  // The number is drawn ONCE, by the new-schema insert, and handed to the
  // exchange half below. Before this, exchange's column DEFAULT drew the
  // shared sequence a second time and the two schemas held different numbers
  // for the same order - the one find of the wave-1 parity ledger.
  const { number } = await orders.createOrder(id, user.id, status, by, executor);

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093). A sales order gets its
  // refiners.orders row at birth, values NULL until a refinery is involved -
  // the invariant the backfill established, maintained for new traffic.
  await refinerOrders.ensureForOrder(id, executor);

  await orders.createTotals(
    randomUUID(),
    id,
    [
      p.order_total ?? null,
      p.shipping_charge ?? null,
      sales_order.service?.label ?? null,
      p.pre_charges_amount ?? null,
      p.post_charges_amount ?? null,
      p.subject_to_charges_amount ?? null,
      sales_order.using_funds ?? null,
      p.item_total ?? null,
      p.base_total ?? null,
      p.charges_amount ?? null,
      p.sales_tax ?? null,
    ],
    by,
    executor
  );

  // The address LINK. Both ids are the address-book row today: the snapshot is
  // taken at checkout by features/orders/create.ts on the path that replaces
  // this one, and until then exchange records only the book id - so recording
  // it as both is the honest reading of what exchange holds, not an invention.
  await orders.createAddress(
    randomUUID(), id, sales_order.address.id, sales_order.address.id, executor
  );

  await legacy.createOrder(
    id,
    [
      user.id,
      sales_order.address.id,
      status,
      p.order_total ?? null,
      sales_order.service?.label ?? null,
      p.shipping_charge ?? null,
      p.pre_charges_amount ?? null,
      p.post_charges_amount ?? null,
      p.subject_to_charges_amount ?? null,
      sales_order.using_funds ?? null,
      p.item_total ?? null,
      p.base_total ?? null,
      p.charges_amount ?? null,
      p.sales_tax ?? null,
    ],
    number,
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
export type PricedItem = Record<string, unknown> & {
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
export async function insertItems(
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

    await orders.createItem(
      id, orderId, product_id, metalOf(item), price, quantity, premium, tax_rate, executor
    );
    await legacy.createItem(
      id, orderId, product_id, price, quantity, premium, tax_rate, executor
    );
  }

  // The refiner counterparts, one per line (093's mirror completion applied
  // to new traffic) - orders.items and refiners.items match counts by
  // construction, the invariant refiner-edits.test.js pins.
  await refinerItems.mirrorLinesForOrder(orderId, executor);
}

// The composed spot shape (`name` / `ask` / `bid`) - what getSpotPrices
// returns since D84 retired the legacy spellings.
export type QuotedSpot = { name: string; ask?: number | null; bid?: number | null };

// The quoted spots. exchange keys them by metal NAME and the new schema by
// metal id, so the caller supplies the resolution - it already holds the map.
export async function insertOrderMetals(
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
      await orders.createSpot(
        randomUUID(), orderId, metal_id, spot.ask ?? null, spot.bid ?? null, executor
      );
    }
    // exchange.order_metals still calls the metal `type`; that spelling is the
    // COLUMN's, stated in legacy.repo.ts, not the wire's.
    await legacy.createSpot(orderId, spot.name, spot.ask ?? null, executor);
  }

  // The refiner counterparts, unquoted (093's coverage invariant: no customer
  // spot without its refiner row).
  await refinerSpots.coverFromOrderSpots(orderId, executor);
}

export async function updateStatus(
  order: { id: string }, status: string, by: string | null, executor?: Executor
): Promise<{ id: string } | undefined> {
  const id = await orders.setStatus(order.id, status, by, executor);
  await legacy.setStatus(order.id, status, by, executor);
  return id ? { id } : undefined;
}

// The three workflow flags share one path because they are one operation with
// three targets - see the FLAGS note in repo.ts for why the column name can be
// substituted safely.
export async function setFlag(
  id: string, flag: Flag, executor?: Executor
): Promise<{ id: string } | undefined> {
  const written = await orders.setFlag(id, flag, executor);
  await legacy.setFlag(id, flag, executor);
  return written ? { id: written } : undefined;
}

export async function attachSupplierToOrder(
  id: string, supplier_id: string, executor?: Executor
): Promise<{ id: string; supplier_id: string | null } | undefined> {
  const row = await orders.setRefinery(id, supplier_id, executor);
  await legacy.setSupplier(id, supplier_id, executor);
  return row;
}
