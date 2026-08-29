// AN ORDER, reassembled from the tables it was split across - BOTH DIRECTIONS.
//
// Was features/purchase-orders/compose.ts and features/sales-orders/compose.ts.
// Direction is a COLUMN, not a feature, so the two live here together: the
// product shape, the shipment nesting, the address snapshot and the empty
// payout are ONE declaration rather than a cross-feature import, which is what
// the sales half already had to do (it imported EMPTY_SHIPMENT, nestShipment
// and snapshotAddress from the purchase file).
//
// What is NOT unified is the composed ORDER itself, deliberately. A purchase
// order has scrap lines, a payout, a carrier pickup, a return shipment and the
// refiner's assay figures; a sale has none of those and has sales tax instead.
// The column lists are ordered projections that `verify:orders-decomposition`
// and `verify:sales-order-decomposition` compare field by field - fragments.ts
// records what happened the last time ten identical columns were factored out
// (the response reordered and `diff` caught it). So: shared values shared,
// ordered projections kept apart, and the direction is in the function name.
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
// The refiner's assay row comes from the CONTRACT rather than from the
// refiners feature's repo, where it is a one-line alias of exactly this.
// Same type, one less hop, and one less type edge between two features.
import type { refiners } from "@dorado/contracts";
// PayoutRow is NOT an alias and is NOT swapped for wire/payouts.ts's `Payout`.
// The contract derives itself from exchange.payouts by omitting the two
// columns known to be sensitive today, so a THIRD sensitive column added to
// that table would be admitted automatically. The repo's hand-written list
// refuses by default, which on the most sensitive table in the database is
// the property worth keeping. See features/payouts/repo.ts's header.
import type { PayoutRow } from "#features/payouts/repo.ts";

// The bullion half of a line, when there is one. The Next wire's names (D84):
// products.bullion's own name/description/type, plus gross, purity and the
// mint's name - and no variant_group or shadow_offset, which the contract
// dropped.
export type ComposedProduct = {
  id: string | null;
  name: string | null;
  description: string | null;
  type: string | null;
  metal_type: string | null;
  content: number | null;
  gross: number | null;
  purity: number | null;
  bid_premium: number | null;
  ask_premium: number | null;
  image_front: string | null;
  image_back: string | null;
  mint_name: string | null;
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
  refinerItems: Map<string, refiners.ItemsRow>;
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
  id: null, name: null, description: null, type: null, metal_type: null,
  content: null, gross: null, purity: null, bid_premium: null,
  ask_premium: null, image_front: null, image_back: null, mint_name: null,
};

export function composePurchaseItem(
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
type OrderParts = {
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
// Returning `null` instead would make `order.payout.cost` THROW, at every call
// site that reads through one - a wire change of the worst kind, because it
// does not show up until the one order without a payout is opened.
//
// *** THE KEY LIST BELOW IS LOAD-BEARING, AND UNTIL 2026-08-29 NOTHING SAID SO.
//     An earlier version of this comment claimed `order.payout.cost` "gives
//     undefined today". That is FALSE for `cost` - it is in the list, so the
//     value is null and `x - null` is `x` - and true for any key that is NOT.
//     features/pricing/bid.ts subtracted `order.payout.cost` undefended, so a
//     key dropped from this list would have turned the whole invoice into NaN,
//     silently. That call site defends itself now, and this note stays because
//     the general hazard does: a member missing from one of these arrays is
//     `undefined` where every reader expects null, and undefined is the value
//     that poisons arithmetic instead of behaving as zero.
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

// THE ADDRESS SNAPSHOT (D84). The raw row is the address-BOOK row - see the
// header for why - and the wire keeps the book's id AS address_id because
// checkout resolves against the book. recipient_name is what the book's
// smeared `name` always meant on an order: who receives the shipment. No
// user_id, no is_default, no timestamps - a snapshot is neither a place nor a
// relationship. Null stays null: the projections this replaces used
// to_jsonb(addr), which is NULL when the join misses.
//
// Shared with the sale direction below, like nestShipment: the snapshot is
// identical in both directions.
export type ComposedAddress = {
  address_id: string | null;
  recipient_name: string | null;
  line_1: string | null;
  line_2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  country_code: string | null;
  zip: string | null;
  phone_number: string | null;
  is_residential: boolean | null;
  is_valid: boolean | null;
};

export function snapshotAddress(row: unknown): ComposedAddress | null {
  if (!row || typeof row !== "object") return null;
  const a = row as Record<string, unknown>;
  return {
    address_id: (a.id as string | null) ?? null,
    recipient_name: (a.name as string | null) ?? null,
    line_1: (a.line_1 as string | null) ?? null,
    line_2: (a.line_2 as string | null) ?? null,
    city: (a.city as string | null) ?? null,
    state: (a.state as string | null) ?? null,
    country: (a.country as string | null) ?? null,
    country_code: (a.country_code as string | null) ?? null,
    zip: (a.zip as string | null) ?? null,
    phone_number: (a.phone_number as string | null) ?? null,
    is_residential: (a.is_residential as boolean | null) ?? null,
    is_valid: (a.is_valid as boolean | null) ?? null,
  };
}

// The Next wire (D84): the schema's own names - `number`, `status`, the money
// nested as `totals` under orders.transactions' names - in the same key order
// as both SQL implementations, because `diff` serialises the row to compare it
// and a reordering there reads as a divergence.
export function composePurchaseOrder(p: OrderParts): Record<string, unknown> {
  return {
    id: p.order.id,
    user_id: p.order.user_id,
    address_id: p.addressLink?.source_address_id ?? null,
    status: p.order.status,
    notes: p.order.notes,
    created_at: p.order.created_at,
    updated_at: p.order.updated_at,
    created_by: p.order.created_by,
    updated_by: p.order.updated_by,
    number: p.order.number,
    // OFFERS ARE GONE (086). spots_locked moved to orders.orders because it is
    // a property of the order, and the money comes off the transaction, which
    // is where the order's money lives. offer_amount was a second copy of that
    // same number: measured across 21 orders before the table was dropped,
    // exchange.purchase_orders.total_price and orders.transactions.total agreed
    // on every row, nulls included.
    spots_locked: p.order.spots_locked ?? null,
    waive_shipping_fee: p.totals?.waive_shipping_fee ?? null,
    waive_payout_fee: p.totals?.waive_payout_fee ?? null,
    shipping_paid: p.totals?.shipping_paid ?? null,
    review_created: p.order.review_created,
    shipping_fee_actual: p.totals?.shipping_fee_actual ?? null,
    pool_remediation: p.totals?.pool_remediation ?? null,
    pool_oz_deducted: p.totals?.pool_oz_deducted ?? null,
    // ALWAYS AN OBJECT, never null, every key present: OrderTotals
    // declares all ten. The sale-side keys are read off the transactions row
    // like repo.next.ts does - every purchase row holds NULL for them (0 of
    // 40 in dev), which is also what repo.exchange.js projects, so the three
    // reads agree.
    totals: {
      total: p.totals?.total ?? null,
      items: p.totals?.items ?? null,
      shipping: p.totals?.shipping ?? null,
      surcharge: p.totals?.surcharge ?? null,
      sales_tax: p.totals?.sales_tax ?? null,
      funds: p.totals?.funds ?? null,
      refiner_fee: p.totals?.refiner_fee ?? null,
      base_total: p.totals?.base_total ?? null,
      subject_to_charges_amount: p.totals?.subject_to_charges_amount ?? null,
      post_charges_amount: p.totals?.post_charges_amount ?? null,
    },
    order_items: p.items,
    address: snapshotAddress(p.address),
    shipment: nestShipment(p.shipment as Record<string, unknown> | null),
    return_shipment: nestShipment(p.return_shipment as Record<string, unknown> | null),
    carrier_pickup: p.carrier_pickup,
    payout: p.payout ?? EMPTY_PAYOUT,
    user: p.user,
  };
}

export type ComposedOrder = {
  id: string;
  user_id: string | null;
  address_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  created_by: string | null;
  updated_by: string | null;
  number: number | null;
  spots_locked: boolean | null;
  waive_shipping_fee: boolean | null;
  waive_payout_fee: boolean | null;
  shipping_paid: boolean | null;
  review_created: boolean | null;
  shipping_fee_actual: number | null;
  pool_remediation: number | null;
  pool_oz_deducted: number | null;
  totals: Record<string, number | null>;
  order_items: ComposedItem[];
  address: ComposedAddress | null;
  shipment: Record<string, any>;
  return_shipment: Record<string, any>;
  carrier_pickup: Record<string, any> | null;
  payout: Record<string, any>;
  user: { user_id: string | null; user_name: string | null; user_email: string | null };
};

// ===========================================================================
// THE SALE DIRECTION
//
// Simpler than a purchase order: three rows rather than four. No offer - that
// is the point of keeping offers out of the order row rather than as columns
// null on half of them - no payout, no refiner numbers, and no scrap, because
// a sale is always bullion.
//
// Still read from exchange, each for its own reason: the customer (auth is
// blocked) and the address BOOK row (features/places owns that pivot).
// ===========================================================================
// A sales-order line. No `scrap` and no `item_type`: a sale is always bullion,
// and the projection never built either.
export type ComposedSalesItem = {
  id: string;
  sales_order_id: string | null;
  price: number | null;
  quantity: number | null;
  premium: number | null;
  product: ComposedProduct;
};

export function composeSalesItem(
  item: OrderItemRow, products: Map<string, ComposedProduct>
): ComposedSalesItem {
  return {
    id: item.id,
    sales_order_id: item.order_id,
    price: item.price,
    quantity: item.quantity,
    premium: item.premium,
    product:
      item.bullion_id === null
        ? EMPTY_PRODUCT
        : (products.get(item.bullion_id) ?? EMPTY_PRODUCT),
  };
}

export type SalesOrderParts = {
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
    order_sent: boolean | null;
    tracking_updated: boolean | null;
    // From the ENGAGEMENT (refiners.orders, 093) via the read's LEFT JOIN -
    // orders.orders.refinery_id dropped in 094. The alias keeps the wire's
    // `supplier_id` spelling below. The engagement's own id is deliberately
    // NOT here: engagement addressing is GET /orders/:orderId/refiners.
    refinery_id: string | null;
  };
  totals?: OrderTotalsRow;
  addressLink?: OrderAddressRow;
  items: ComposedSalesItem[];
  address: unknown;
  shipment: Record<string, unknown> | null;
  user: { user_id: string | null; user_name: string | null; user_email: string | null };
};

// The Next wire (D84): the schema's own names. The FIVE RENAMES the old
// composition undid on the way out of orders.transactions - total ->
// order_total, shipping -> shipping_cost, funds -> pre_charges_amount, items
// -> item_total, surcharge -> charges_amount - are simply not undone any
// more: the money nests as `totals` under the transactions table's own names,
// which is also what sql/create_totals.sql writes. pre_charges_amount was the
// one exchange column without a same-name home; `funds` IS that column's
// value, so totals.funds is where it honestly lives.
//
// totals.refiner_fee is NULL for a sales order, deliberately: exchange never
// had the column, orders.transactions holds a literal column default (0) on
// every sale row, and no sales order has ever carried a refiner fee on the
// wire. Projecting the default would make the decomposition gate's exchange
// comparison diverge on a value exchange cannot produce.
//
// `supplier_id` is `refinery_id`: features/refiners owns that rename and the
// wire still says supplier.
export function composeSalesOrder(p: SalesOrderParts): Record<string, unknown> {
  return {
    id: p.order.id,
    user_id: p.order.user_id,
    address_id: p.addressLink?.source_address_id ?? null,
    status: p.order.status,
    notes: p.order.notes,
    created_at: p.order.created_at,
    updated_at: p.order.updated_at,
    created_by: p.order.created_by,
    updated_by: p.order.updated_by,
    number: p.order.number,
    review_created: p.order.review_created,
    shipping_service: p.totals?.shipping_service ?? null,
    used_funds: p.totals?.used_funds ?? null,
    order_sent: p.order.order_sent,
    tracking_updated: p.order.tracking_updated,
    supplier_id: p.order.refinery_id,
    // ALWAYS AN OBJECT, never null, every key present - OrderTotals
    // declares all ten.
    totals: {
      total: p.totals?.total ?? null,
      items: p.totals?.items ?? null,
      shipping: p.totals?.shipping ?? null,
      surcharge: p.totals?.surcharge ?? null,
      sales_tax: p.totals?.sales_tax ?? null,
      funds: p.totals?.funds ?? null,
      refiner_fee: null,
      base_total: p.totals?.base_total ?? null,
      subject_to_charges_amount: p.totals?.subject_to_charges_amount ?? null,
      post_charges_amount: p.totals?.post_charges_amount ?? null,
    },
    order_items: p.items,
    address: snapshotAddress(p.address),
    user: p.user,
    // A sales order has ONE shipment, not two - there is no return leg. Same
    // all-null-when-absent rule as a purchase order's, because the projection
    // used the same jsonb_build_object.
    shipment: p.shipment ? nestShipment(p.shipment) : EMPTY_SHIPMENT,
  };
}

// THE COMPOSED SALES ORDER, AS A TYPE - internal, not a contract (wave 3).
// Same reasoning as the purchase half above's ComposedOrder: this
// was the SalesOrder wire schema until the order wire slimmed, and it now
// describes only what the API assembles for its own pricing, emails and PDFs.
export type ComposedSalesOrder = {
  id: string;
  user_id: string | null;
  address_id: string | null;
  supplier_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  created_by: string | null;
  updated_by: string | null;
  number: number | null;
  review_created: boolean | null;
  order_sent: boolean | null;
  tracking_updated: boolean | null;
  shipping_service: string | null;
  used_funds: boolean;
  totals: Record<string, number | null>;
  order_items: ComposedSalesItem[];
  address: Record<string, any> | null;
  shipment: Record<string, any>;
  user: { user_id: string | null; user_name: string | null; user_email: string | null };
};
