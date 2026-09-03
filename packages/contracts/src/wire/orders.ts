import { z } from "zod/v4";
import {
  ItemsRow,
  OrdersRow,
  SpotsRow,
  TransactionsRow,
} from "../generated/orders.js";
import { AddressesRow } from "../generated/places.js";
import { BullionRow } from "../generated/products.js";
import { PickupsRow, ShipmentsRow } from "../generated/shipping.js";
import { UsersRow } from "../generated/auth.js";
import { Payout } from "./payouts.js";

// THE ORDER ON THE WIRE IS THE ROW (Jacob, wave 3, on reading the composed
// contract this replaces): "We only need the bullion_id for production
// information. We don't need to send all that shit back in the body with it.
// That was the whole point of combining scrap/bullion into just items."
//
// So an order read returns orders.orders VERBATIM plus `totals`, and nothing
// else. Every other piece of an order is its own parent-path read of its own
// table (see THE ORDER-SCOPED READ FAMILY below). What died here on
// 2026-08-28, and why each one had to:
//
//   order_items[]           a second table smeared onto the parent -
//                           GET /orders/:id/items
//   ScrapOnOrderItem        the scrap/bullion split the ONE items table
//   ProductOnOrderItem      exists to end; a line carries bullion_id and the
//                           client maps the catalogue it already caches
//   SpotOnOrder             Jacob: "Don't know why we need a whole separate
//                           type for spot on order either" - it is
//                           orders.spots' row, and its `name` was a join
//   PayoutSlotOnOrder       an OBJECT OF NULLS on every order without a
//                           payout, which is not a shape, it is a workaround
//   ShipmentSlotOnOrder     twice, as shipment / return_shipment - two named
//                           slots for one table with a `direction` column
//   OrderAddressSnapshot    postal facts of another table's row
//   UserOnOrder             three columns of exchange.users, joined on
//   carrier_pickup          shipping.pickups, hanging off the SHIPMENT
//   PurchaseOrder /         two names for one table; `direction` is the
//   SalesOrder              column that tells them apart
//
// THE ORDER-SCOPED READ FAMILY (each verbatim rows, nothing nested):
//   GET /orders                       Order[]        (this file)
//   GET /orders/:orderId/items        OrderItem[]
//   GET /orders/:orderId/spots        OrderSpot[]
//   GET /orders/:orderId/address      OrderAddress   (the snapshot)
//   GET /orders/:orderId/payouts      Payout[]       (wire/payouts.ts)
//   GET /orders/:orderId/fulfillments OrderFulfillment (wire/fulfillments.ts)
//   GET /orders/:orderId/shipments    Shipment[]     (wire/shipping.ts)
//   GET /orders/:orderId/pickups      FulfillmentPickup[]
//   GET /orders/:orderId/directs      FulfillmentDirect[]
//   GET /orders/:orderId/refiners     RefinerOrder   (wire/refiners.ts)
//   GET /orders/:orderId/refiners/spots RefinerSpot[]
//   GET /shipments/:shipmentId/pickups  ShipmentPickup[]     (wire/shipping.ts)
//
// Display names are the CLIENT's job, mapped by id against reference reads it
// already caches: metal_id against /spots, bullion_id against /products,
// method_id against /fulfillments/methods, user_id against /users. No joined
// scalar rides on any row - "we shouldn't let UI dictate the API."
//
// Timestamps are strings, not Dates. validate-wire compares
// JSON.parse(JSON.stringify(row)) because that is what the frontend actually
// receives, and serialisation turns every Date into an ISO string.

// The order's own money, VERBATIM orders.transactions (ruling 12). It survives
// as a nested member where nothing else did, for the reason Jacob gave when he
// pinned the slim: transactions IS the order's money, not another resource's
// row borrowed onto it. Null for an order whose transactions row does not
// exist - the six new-schema-only strays clean:dual-orphans removes.
export const OrderTotals = TransactionsRow;
export type OrderTotals = z.infer<typeof OrderTotals>;

// ONE ORDER SHAPE, BOTH DIRECTIONS. orders.orders holds a `direction` column;
// two contract names for one table were the last of the legacy per-direction
// vocabulary, the same way /purchase_orders and /sales_orders were.
export const Order = OrdersRow.extend({
  totals: OrderTotals.nullable(),
});
export type Order = z.infer<typeof Order>;

// GET /orders/:orderId/items - orders.items rows VERBATIM. bullion_id is the
// ONLY product reference and metal_id the only metal reference; a scrap line
// carries its weights and purity inline and has a null bullion_id, which is
// what "combining scrap/bullion into just items" bought. The refiner's assay
// figures are NOT here - they are refiners.items, /orders/:id/refiners.
export const OrderItem = ItemsRow;
export type OrderItem = z.infer<typeof OrderItem>;

// GET /orders/:orderId/spots - orders.spots rows VERBATIM. The metal is its
// id; `name` was a join and dies with the composed wire.
export const OrderSpot = SpotsRow;
export type OrderSpot = z.infer<typeof OrderSpot>;

// GET /orders/:orderId/address - THE SNAPSHOT, and it is places.addresses'
// own row, verbatim.
//
// WHY THIS IS A READ AND NOT COLUMNS OF THE ORDER. An order address is
// immutable postal fact, so "columns on the order row" was a live option -
// and it is not what the database holds. orders.addresses is a LINK table
// with two ids: `address_id`, the frozen places.addresses row recording where
// the parcel actually went, and `source_address_id`, the address-book entry
// it was copied from. The snapshot is a row of another table, reached through
// a link table; putting its columns on the order would be the join-smear
// ruling 12 forbids, and putting the link row on the order would serve two
// ids and no address. So the server resolves the chain in its WHERE clause -
// which is exactly what ruling 12 permits - and returns the row it lands on.
export const OrderAddress = AddressesRow;
export type OrderAddress = z.infer<typeof OrderAddress>;

// ===========================================================================
// THE ORDER VIEW - one order, assembled from its tables (D214 item 12)
// ===========================================================================
// Jacob, on `domain/orders/compose.ts`: *"we still have this compose file
// which sucks to see"*. The composer built two 600-line hand-written
// projections - a purchase shape and a sale shape - that renamed columns
// (`net_charge` -> `shipping_charge`), invented all-null objects for absent
// rows, base64-wrapped a label into the response and read `exchange.addresses`
// and `exchange.users` to do it. This replaces all of it.
//
// THE RULES THIS SHAPE OBEYS, each of which the composer broke:
//   ROWS, NOT PROJECTIONS. Every member is a generated row schema, so a column
//   added to a table appears here for free and one removed fails the build.
//   NESTED BY TABLE, NOT BY SLOT. `shipments` is the shipping.shipments rows
//   with their own `direction` column - not a `shipment` / `return_shipment`
//   pair of named slots for one table.
//   ABSENT IS null. Never an object whose every key is null; a reader that
//   wants a fee reads `view.payout?.cost`.
//   NO RENAMES and NO DERIVED SCALARS. `item_type` is `bullion_id === null`,
//   which is a rule, and rules live in domain/orders/rules.ts.
//   NOT A LIST WIRE. `Order` above is still what GET /orders serves. This is
//   what ONE order's document, email and pricing read.
// THE CATALOGUE ROW BEHIND A BULLION LINE - the PUBLIC columns of
// products.bullion, which is exactly what db/products/sql/get_by_ids.sql
// projects. Stock, display flags, the supplier and the audit columns are not
// facts about an order line and do not travel with one.
export const OrderViewProduct = BullionRow.pick({
  id: true, name: true, description: true, content: true, purity: true,
  gross: true, bid_premium: true, ask_premium: true, type: true,
  image_front: true, image_back: true, variant_group: true,
  shadow_offset: true, slug: true, legal_tender: true, domestic_tender: true,
  is_generic: true, variant_label: true, metal_id: true,
  mint_id: true,
});
export type OrderViewProduct = z.infer<typeof OrderViewProduct>;

export const OrderViewItem = ItemsRow.extend({
  // Null on a scrap line, where the weights and the purity are columns of the
  // line itself.
  product: OrderViewProduct.nullable(),
});
export type OrderViewItem = z.infer<typeof OrderViewItem>;

// The order's parcels. `direction` widens to text because the read casts it -
// `shipping.direction` is an enum in the table and a string on every wire it
// has ever reached.
export const OrderViewShipment = ShipmentsRow.extend({ direction: z.string() });
export type OrderViewShipment = z.infer<typeof OrderViewShipment>;

// LAST FOUR ONLY - wire/payouts.ts's own security carve-out, reused rather
// than restated, so a third sensitive column added to that table cannot arrive
// here by accident. `created_at` is dropped: when a customer saved their bank
// account is not a fact about this order.
// `method` and `account_holder_name` widen to nullable here and nowhere else:
// the order-scoped read reaches the method through a LEFT JOIN on
// payments.methods, so a payout account saved before a method existed carries
// neither.
export const OrderViewPayout = Payout.omit({ created_at: true }).extend({
  method: z.string().nullable(),
  account_holder_name: z.string().nullable(),
});
export type OrderViewPayout = z.infer<typeof OrderViewPayout>;

// WHO THE ORDER IS FOR: three columns of auth.users, which has been the
// authoritative identity row since the 2026-09-01 cutover.
export const OrderViewUser = UsersRow.pick({ id: true, name: true, email: true });
export type OrderViewUser = z.infer<typeof OrderViewUser>;

export const OrderView = z.object({
  order: OrdersRow,
  totals: TransactionsRow.nullable(),
  items: z.array(OrderViewItem),
  // The places.addresses snapshot the parcel actually went to, reached through
  // the orders.addresses link - the same row GET /orders/:id/address serves.
  address: AddressesRow.nullable(),
  // BOTH LEGS IN ONE ARRAY. An inbound label and a return label are two rows
  // of one table that differ by `direction`.
  shipments: z.array(OrderViewShipment),
  // The CARRIER pickup booked against the order's shipment, when there is one.
  pickup: PickupsRow.nullable(),
  payout: OrderViewPayout.nullable(),
  user: OrderViewUser.nullable(),
});
export type OrderView = z.infer<typeof OrderView>;

// ===========================================================================
// THE REQUEST BODIES
// ===========================================================================
// Everything above describes what the API RETURNS. These describe what the
// write surface ACCEPTS, and every one of them is IDS PLUS GENUINELY NEW DATA
// (ruling 43): if the server could have looked it up, the id is the whole
// message. Each is `.strict()`, so a field the endpoint does not have is a
// refusal naming it rather than a key zod silently strips.

// POST /{purchase,sales}_orders/create_* - THE WHOLE BODY IS ONE ID.
//
// It replaces `SalesOrderCreate`, which carried the browser's checkout
// document: the address book row, the cart lines, the delivery service, the
// payment method, the credit checkbox and a `spot_prices` field that was
// declared only so it could be ignored. Every one of those is a column of
// checkout.checkouts or checkout.items, which the server already holds; the
// customer is the checkout row's own `user_id`, so the admin door and the
// customer door take the same body.
export const OrderCreate = z.object({ checkout_id: z.string() }).strict();
export type OrderCreate = z.infer<typeof OrderCreate>;

// POST /{purchase,sales}_orders/create_review - the review flag. The order is
// sent whole because requireOwnOrder reads its id out of the body; only the id
// is used.
export const OrderReviewCreate = z.object({
  order: z.looseObject({ id: z.string() }),
  user_id: z.string().optional(),
}).strict();
export type OrderReviewCreate = z.infer<typeof OrderReviewCreate>;

// POST /orders/:id/items - ONE NEW LINE, AND THE TWO KINDS ARE A UNION.
//
// A line is a catalogue product OR a declared lot of scrap, and the two need
// different facts. The old body was `{ item: looseObject }` read through
// `Record<string, unknown>` with a metal NAME on it, so the server resolved a
// customer-supplied string against metals.metals; both members here name ids
// the client already holds, and two pure rules turn either into a row.
export const OrderItemFromBullion = z.object({ bullion_id: z.string() }).strict();
export type OrderItemFromBullion = z.infer<typeof OrderItemFromBullion>;

export const OrderItemFromScrap = z.object({
  metal_id: z.string(),
  pre_melt: z.number(),
  purity: z.number(),
  unit: z.string(),
}).strict();
export type OrderItemFromScrap = z.infer<typeof OrderItemFromScrap>;

export const OrderItemCreate = z.union([OrderItemFromBullion, OrderItemFromScrap]);
export type OrderItemCreate = z.infer<typeof OrderItemCreate>;

// POST /orders/:id/cancel - the customer's metal goes back.
//
// It replaces `{ cancel: { return_shipment } }`, which was the admin drawer's
// whole form typed `Record<string, any>` and hand-mapped into the carrier
// call. Where the parcel goes is the ORDER's own address snapshot; who signs
// for it is the provider's configured contact; what it is worth is priced
// from the order's own lines. What is genuinely new is the box, the service
// and the amount to insure.
// `weight` is the one MEASUREMENT here: nothing stores what the parcel going
// back weighs, and a label cannot be bought without it. The other three are
// ids and an amount.
export const OrderCancel = z.object({
  carrier_service_id: z.string(),
  package_id: z.string(),
  declared_value: z.number(),
  weight: z.number(),
}).strict();
export type OrderCancel = z.infer<typeof OrderCancel>;

// POST /orders/:id/label - RETRY SURFACE for a purchase order whose own label
// purchase failed after the order committed (label-after-commit, 2026-09-03:
// place.ts's WRITE never waits on the carrier, so a failed AFTER leaves a real
// order with an unlabelled shipment instead of a rolled-back one). `weight`
// is asked for the same reason OrderCancel asks it: it was never a column,
// and checkout - its only copy - is long consumed by the time this order
// exists to retry. The pickup slot is asked only when the shipment's own
// handoff needs one.
export const OrderLabel = z.object({
  weight: z.number(),
  pickup_date: z.string().nullable().optional(),
  pickup_time: z.string().nullable().optional(),
}).strict();
export type OrderLabel = z.infer<typeof OrderLabel>;

// PUT /orders/:id/spots - pin or unpin the order's spots, and adjust one.
//
// `lock: true` freezes every metal on the order at today's feed; `lock: false`
// clears the bids it pinned. `set` names a metal by ID and not by name: a
// display string used to decide which money row an edit landed on.
export const OrderSpotWrite = z.object({
  metal_id: z.string(),
  bid: z.number(),
}).strict();
export type OrderSpotWrite = z.infer<typeof OrderSpotWrite>;

export const OrderSpotsPut = z.object({
  lock: z.boolean().optional(),
  set: z.array(OrderSpotWrite).optional(),
}).strict();
export type OrderSpotsPut = z.infer<typeof OrderSpotsPut>;

// POST /orders/:id/send_to_refiner - which refinery gets the metal. The spots
// the message quotes are the ORDER's frozen ones, read server-side: they used
// to arrive in the body, which is the $26.81-an-ounce hazard.
export const OrderSendToRefiner = z.object({ refiner_id: z.string() }).strict();
export type OrderSendToRefiner = z.infer<typeof OrderSendToRefiner>;
