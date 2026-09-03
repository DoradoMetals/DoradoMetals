// Shared contracts for the Dorado API.
//
// ONE FILE PER DATABASE ENTITY, mirroring the database:
// `src/<schema>/<table>.ts`, re-exported here as nested namespaces, so a
// consumer writes the table's own address:
//
//   import { orders, products, checkout } from "@dorado/contracts";
//   orders.orders.Row     orders.items.Patch     products.bullion.Public
//   checkout.items.New    orders.enums.Direction
//
// Each entity file holds a GENERATED REGION - the `Row` schema, written from
// information_schema and never edited by hand - and, below it, hand-written
// derivations that are all `.pick()` / `.omit()` / `.extend()` of a Row: `New`,
// `Patch`, and the named reads an endpoint serves. So every field that crosses
// the wire traces to a column, and a column added, dropped or made nullable
// shows up in the contract rather than in production.
//
// `computed/` is the one exception and is pinned from both sides by
// `lint:contracts-derived`: shapes no table backs - the quote surface's
// arithmetic and the carrier provider catalogue.
export * from "./schemas.js";

export * as quotes from "./computed/quotes.js";
export * as providers from "./computed/providers.js";
