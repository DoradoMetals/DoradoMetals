// Shared contracts for the Dorado API.
//
// ONE FILE PER DATABASE ENTITY, and ONE FLAT NAMESPACE (Jacob, 2026-09-03:
// "It should be Rate. That's it."). The file mirrors the database -
// `src/<schema>/<table>.ts` - and the export is the entity's own name:
//
//   import { Rate, RatePatch, OrderItem, BullionStorefront } from "@dorado/contracts";
//
// A collision is resolved by the name the code already uses for the concept -
// orders.items is an `OrderItem`, checkout.items is a `CheckoutItem`,
// refiners.items is a `RefinerItem` - never by a schema prefix.
//
// Each entity file holds a GENERATED REGION - the entity schema, written from
// information_schema and never edited by hand - and, below it, hand-written
// derivations that are all `.pick()` / `.omit()` / `.extend()` of an entity:
// `<Entity>Patch`, and the named reads an endpoint serves. So every field that
// crosses the wire traces to a column, and a column added, dropped or made
// nullable shows up in the contract rather than in production.
//
// THERE IS NO `New<Entity>` (Jacob: "For new, it can just send the patch!!").
// A create takes the same patch an update does; the database's NOT NULL
// columns and defaults decide what a create needs, and a missing one comes
// back as the shared pg-error translation naming the column.
//
// `computed/` is the one exception and is pinned from both sides by
// `lint:contracts-derived`: shapes no table backs - the quote surface's
// arithmetic and the carrier provider catalogue.
export * from "./schemas.js";

export * from "./computed/quotes.js";
export * from "./computed/providers.js";
export * from "./computed/orders.js";
export * from "./computed/fulfillments.js";
export * from "./computed/shipping.js";
export * from "./computed/rates.js";
export * from "./computed/places.js";
