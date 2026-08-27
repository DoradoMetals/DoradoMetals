// Spot types, FROM THE CONTRACTS.
//
// SECOND CONVERTED FEATURE. SpotPrice used to be hand-written with the LEGACY
// field names (`type` / `ask_spot` / `bid_spot`) plus optional order ids -
// one type serving two different wires. It is now the live spot feed's shape
// only, imported from @dorado/contracts so `tsc` sees a rename from both
// sides; the schema's own names are `name` / `ask` / `bid`.
//
// What used to share this file moved to where its wire lives:
//   - the order-locked spot rows (exchange.order_metals, embedded in order
//     responses and mutation bodies) are features/orders/orderSpots.ts - the
//     ORDERS wire still speaks legacy names, and that file owns the edge
//     conversion until orders itself converts;
//   - AdminMetal is features/products/types.ts - it is served by
//     /products/get_metals and converts with products.
import type { SpotPriceWireNext } from "@dorado/contracts";

export type Metal = "Gold" | "Silver" | "Platinum" | "Palladium";

export type SpotPrice = SpotPriceWireNext;
