// A purchase order, reassembled from the tables it was split across.
//
// exchange kept a purchase order in one wide row. It is now spread over
// orders.orders, orders.transactions, orders.addresses,
// orders.items and refiners.items, with the shipment, the pickup, the payout
// and the customer alongside. The implementation this replaces put it back
// together in ONE query joining thirteen tables and building six nested objects
// with jsonb_build_object; this does the same from one read per table.
//
// THE SHAPE IS THE CONSTRAINT. The frontend destructures every one of those
// nested objects, and CLAUDE.md forbids changing a wire shape during a schema
// migration outright. `verify:orders-decomposition` is the gate: it compares
// the fields that MOVED between tables against the composed query and refuses a
// divergence.
//
// WHAT IS STILL READ FROM exchange, and why each one is not a shortcut:
//
//   payouts  - payments has not been restructured, and `payments.details` must
//              not receive plaintext bank numbers until the encryption question
//              is answered. features/payouts/repo.ts reads last-4 only.
//   users    - auth is the one genuinely blocked feature; better-auth writes
//              exchange directly through its own pool.
//   address  - the SNAPSHOT is places.addresses, but the wire returns the
//              address-BOOK row, and the book is still exchange.addresses until
//              addresses' own reads pivot. features/places/addresses owns that.
//
// Shipments and carrier pickups are NOT in that list any more - both have
// restructured services now, and the service calls them.
import type { OrderItemRow } from "#features/orders/items/repo.ts";
import type { OrderTotalsRow } from "#features/orders/transactions/repo.ts";
import type { OrderAddressRow } from "#features/orders/addresses/repo.ts";
import type { RefinerItemRow } from "#features/refiners/items/repo.ts";
import type { PayoutRow } from "#features/payouts/repo.ts";

// The bullion half of a line, when there is one.
export type ComposedProduct = {
  id: string | null;
  product_name: string | null;
  content: number | null;
  product_type: string | null;
  image_front: string | null;
  image_back: string | null;
  bid_premium: number | null;
  ask_premium: number | null;
  variant_group: string | null;
  shadow_offset: number | null;
  metal_type: string | null;
};

// The scrap half. See composeScrap for why every line has one.
export type ComposedScrap = {
  id: string | null;
  pre_melt: number | null;
  post_melt: number | null;
  purity: number | null;
  content: number | null;
  gross_unit: string | null;
  metal: string | null;
  bid_premium: number | null;
  purity_actual?: number | null;
  post_melt_actual?: number | null;
  content_actual?: number | null;
};

export type ComposedItem = {
  id: string;
  purchase_order_id: string | null;
  price: number | null;
  quantity: number | null;
  confirmed: boolean | null;
  premium: number | null;
  refiner_premium: number | null;
  item_type: "scrap" | "product";
  scrap: ComposedScrap;
  product: ComposedProduct;
};

// What each line needs from tables it does not itself name.
export type ItemContext = {
  // bullion_id -> the product, plus its metal's name.
  products: Map<string, ComposedProduct>;
  // metal_id -> the metal's name, for a scrap line.
  metalNames: Map<string, string>;
  // order_item_id -> what the refiner reported. Admin reads only.
  refinerItems: Map<string, RefinerItemRow>;
};

// THE SCRAP OBJECT IS BUILT FOR EVERY LINE, INCLUDING BULLION ONES, WITH EVERY
// FIELD NULL.
//
// That looks pointless and is not. exchange LEFT JOINs its scrap table and
// builds the object regardless, so a bullion line already carries a scrap
// object full of nulls today - and `item.scrap.content` therefore gives
// `undefined` rather than throwing. Returning `null` instead would be a
// different shape and would start throwing at every call site that reads
// through it.
//
// `id` is the one field that cannot be what it was. exchange returns the SCRAP
// ROW's id; there is no scrap row here, so it returns the LINE's. Nothing reads
// it - the admin table keys on the item - and it is declared rather than
// hidden.
function composeScrap(
  item: OrderItemRow, ctx: ItemContext, withActuals: boolean
): ComposedScrap {
  const isScrap = item.bullion_id === null;
  const only = <T>(v: T): T | null => (isScrap ? v : null);
  const refiner = withActuals ? ctx.refinerItems.get(item.id) : undefined;

  const scrap: ComposedScrap = {
    id: only(item.id),
    pre_melt: only(item.pre_melt),
    post_melt: only(item.post_melt),
    purity: only(item.purity),
    content: only(item.content),
    gross_unit: only(item.unit),
    metal: only(item.metal_id === null ? null : (ctx.metalNames.get(item.metal_id) ?? null)),
    // 085 dropped the bid_premium column: the item's premium IS the scrap
    // line's premium in the one-table model, so the wire's scrap.bid_premium is
    // served from it.
    bid_premium: only(item.premium),
  };

  // The assay actuals are ADMIN-ONLY, and their absence is part of the shape a
  // customer read returns - the keys are not present at all, exactly as the
  // projection omitted them.
  if (withActuals) {
    scrap.purity_actual = only(refiner?.purity ?? null);
    scrap.post_melt_actual = only(refiner?.post_melt ?? null);
    scrap.content_actual = only(refiner?.content ?? null);
  }
  return scrap;
}

const EMPTY_PRODUCT: ComposedProduct = {
  id: null, product_name: null, content: null, product_type: null,
  image_front: null, image_back: null, bid_premium: null, ask_premium: null,
  variant_group: null, shadow_offset: null, metal_type: null,
};

export function composeItem(
  item: OrderItemRow, ctx: ItemContext, withActuals: boolean
): ComposedItem {
  return {
    id: item.id,
    purchase_order_id: item.order_id,
    price: item.price,
    quantity: item.quantity,
    confirmed: item.confirmed,
    premium: item.premium,
    // The refiner's premium, which is a field of the LINE rather than of the
    // scrap object - it sat outside the nested object in the projection too.
    refiner_premium: ctx.refinerItems.get(item.id)?.premium ?? null,
    item_type: item.bullion_id === null ? "scrap" : "product",
    scrap: composeScrap(item, ctx, withActuals),
    // Same reasoning as the scrap object: a scrap line carries a product object
    // full of nulls, because the LEFT JOIN produced one.
    product:
      item.bullion_id === null
        ? EMPTY_PRODUCT
        : (ctx.products.get(item.bullion_id) ?? EMPTY_PRODUCT),
  };
}

// The order's own columns, gathered from the four tables they were split
// across. Named explicitly rather than spread, so a column appearing on one
// side and not the other is a conflict rather than a silent change.
export type OrderParts = {
  order: {
    id: string;
    user_id: string | null;
    status: string | null;
    notes: string | null;
    created_at: Date | null;
    updated_at: Date | null;
    created_by: string | null;
    updated_by: string | null;
    number: number | null;
    review_created: boolean | null;
    spots_locked?: boolean | null;
  };
  totals?: OrderTotalsRow;
  addressLink?: OrderAddressRow;
  // AN ORDER WITH NO LINES RETURNS [], AND THIS IS THE ONE DECLARED DIFFERENCE.
  //
  // The query this replaces used `json_agg(DISTINCT ...)` over a LEFT JOIN, so
  // an order with no items came back with ONE line whose every field is null -
  // a phantom the frontend would render as a blank row. Reproducing it would
  // mean fabricating a line item, which is worse than the shape change.
  //
  // It cannot be observed on any real data: every genuinely real purchase order
  // in dev has lines. The only orders that hit it are the eleven test rows
  // clean:dual-orphans removes.
  items: ComposedItem[];
  address: unknown;
  shipment: unknown;
  return_shipment: unknown;
  carrier_pickup: unknown;
  payout: PayoutRow | null;
  user: { user_id: string | null; user_name: string | null; user_email: string | null };
};

// AN ABSENT NESTED OBJECT IS ALL-NULL, NOT null, AND THAT IS LOAD-BEARING.
//
// Every one of these came from a LEFT JOIN feeding a jsonb_build_object, so an
// order with no payout gets `{id: null, cost: null, ...}` rather than `null`.
// `order.payout.cost` therefore gives `undefined` today. Returning `null`
// instead would make that same expression THROW, at every call site that reads
// through one - which is a wire change of the worst kind, because it does not
// show up until the one order without a payout is opened.
//
// The keys are the ones each projection built, in its order.
const allNull = <T extends readonly string[]>(keys: T): Record<string, null> =>
  Object.fromEntries(keys.map((k) => [k, null]));

export const EMPTY_PAYOUT = allNull([
  "id", "user_id", "order_id", "method", "account_holder_name", "bank_name",
  "account_type", "account_last4", "routing_last4", "email_to", "cost", "created_at",
] as const);

export const EMPTY_SHIPMENT = allNull([
  "id", "purchase_order_id", "sales_order_id", "tracking_number", "shipping_status",
  "estimated_delivery", "shipped_at", "delivered_at", "created_at", "label_type",
  "pickup_type", "package", "shipping_label", "shipping_charge", "shipping_service",
  "insured", "declared_value", "type", "carrier_id",
] as const);

// THERE IS NO EMPTY_PICKUP AND NO EMPTY_ADDRESS, and the reason is a
// distinction in the SQL that is easy to miss:
//
//   jsonb_build_object(...)  builds an object whatever the join found, so an
//                            absent row becomes an object full of nulls.
//   to_jsonb(alias)          is NULL when the alias matched nothing.
//
// The shipment and the payout used the first. The carrier pickup and the
// address used the second, so both are genuinely `null` when absent and giving
// them an all-null object would be the same wire change in the other
// direction. Caught by the gate after over-correcting.

// A SHIPMENT NESTED IN AN ORDER IS NOT THE SHIPMENT THE SHIPMENTS ENDPOINT
// RETURNS, AND TWO FIELDS PROVE IT.
//
// features/orders/fragments.ts renames them on the way into an order:
//
//   net_charge   -> shipping_charge
//   service_type -> shipping_service
//
// GET /shipments returns exchange's own names; the order response has always
// returned these. Nesting the service's row unchanged dropped both and added
// two the frontend does not read - which is what the gate caught, and nothing
// else would have: the shape still parsed, the values were all present, and
// they were simply under different keys.
// THE LABEL IS BASE64'D, AND NOT DOING IT IS EXPENSIVE RATHER THAN WRONG-LOOKING.
//
// shipping_label is a bytea. The projection wrote `encode(..., 'base64')`
// because the driver hands back a Buffer otherwise, and a Buffer serialises as
// {"type":"Buffer","data":[137,80,78,...]} - one integer per byte. The comment
// in features/orders/fragments.ts measured it: that turns 23 rows into half a
// megabyte. It is also not the shape the frontend decodes.
const wrap76 = (b64: string): string => (b64.match(/.{1,76}/g) ?? []).join("\n");

export function nestShipment(s: Record<string, unknown> | null): Record<string, unknown> {
  if (!s) return EMPTY_SHIPMENT;
  const { net_charge, service_type, shipping_label, ...rest } = s;
  return {
    ...rest,
    // WRAPPED AT 76 CHARACTERS, because that is what Postgres's
    // `encode(..., 'base64')` produces - MIME base64, with a newline every 76
    // characters. `Buffer.toString("base64")` produces one unbroken line, and
    // for a 13KB label that is a 172-newline difference in what the frontend
    // receives.
    //
    // Unwrapped would very likely be fine, and arguably safer - `atob` rejects
    // whitespace in some engines. But the frontend decodes the WRAPPED form
    // today and evidently copes, so changing it is a wire change with no
    // benefit during a schema migration. Matched exactly; unwrapping is a
    // deliberate change to make later if anyone wants it.
    shipping_label: Buffer.isBuffer(shipping_label)
      ? wrap76(shipping_label.toString("base64"))
      : (shipping_label ?? null),
    shipping_charge: net_charge ?? null,
    shipping_service: service_type ?? null,
  };
}

// The twenty-five columns exchange.purchase_orders had, in the order the
// projection listed them. Key order is not something a frontend depends on, but
// `diff` serialises the row to compare it - and a reordering there reads as a
// divergence, which is how the shared-column-list experiment was caught.
export function composeOrder(p: OrderParts): Record<string, unknown> {
  return {
    id: p.order.id,
    user_id: p.order.user_id,
    address_id: p.addressLink?.source_address_id ?? null,
    purchase_order_status: p.order.status,
    notes: p.order.notes,
    created_at: p.order.created_at,
    updated_at: p.order.updated_at,
    created_by: p.order.created_by,
    updated_by: p.order.updated_by,
    order_number: p.order.number,
    // OFFERS ARE GONE (086). spots_locked moved to orders.orders because it is
    // a property of the order, and total_price comes off the transaction, which
    // is where the order's money lives. offer_amount was a second copy of that
    // same number: measured across 21 orders before the table was dropped,
    // exchange.purchase_orders.total_price and orders.transactions.total agreed
    // on every row, nulls included.
    spots_locked: p.order.spots_locked ?? null,
    total_price: p.totals?.total ?? null,
    waive_shipping_fee: p.totals?.waive_shipping_fee ?? null,
    waive_payout_fee: p.totals?.waive_payout_fee ?? null,
    shipping_paid: p.totals?.shipping_paid ?? null,
    review_created: p.order.review_created,
    shipping_fee_actual: p.totals?.shipping_fee_actual ?? null,
    refiner_fee: p.totals?.refiner_fee ?? null,
    pool_remediation: p.totals?.pool_remediation ?? null,
    pool_oz_deducted: p.totals?.pool_oz_deducted ?? null,
    order_items: p.items,
    address: p.address,
    shipment: nestShipment(p.shipment as Record<string, unknown> | null),
    return_shipment: nestShipment(p.return_shipment as Record<string, unknown> | null),
    carrier_pickup: p.carrier_pickup,
    payout: p.payout ?? EMPTY_PAYOUT,
    user: p.user,
  };
}

// ORDER BY o.created_at DESC, o.id DESC - the id breaks the tie because
// created_at is not unique, and a read whose ORDER BY is not unique returns
// physical order, which makes two implementations look like they disagree when
// they do not.
export const newestFirst = (
  a: { created_at: Date | null; id: string },
  b: { created_at: Date | null; id: string }
): number => {
  const at = a.created_at ? a.created_at.getTime() : 0;
  const bt = b.created_at ? b.created_at.getTime() : 0;
  return bt - at || b.id.localeCompare(a.id);
};
