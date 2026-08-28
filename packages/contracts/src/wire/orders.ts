import { z } from "zod/v4";
import {
  ItemsRow,
  OrdersRow,
  SpotsRow,
  TransactionsRow,
} from "../generated/orders.js";
import { AddressesRow } from "../generated/places.js";

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
//   GET /shipments/:shipmentId/pickups  CarrierPickup[]
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
