// The legacy spot shape, kept for the code that still prices with it.
//
// Spots is CONVERTED (2026-08-27): SPOTS_WIRE is gone, the adapter with it,
// and /spots/spot_prices serves the schema's own names. What did NOT convert
// is the code downstream of getPricingSpots - the order calculations, the
// supplier PDF and email renderers - which read `type` / `ask_spot` /
// `bid_spot` because exchange.order_metals and the ORDERS wire still speak
// those names. This module is that one remaining conversion, unconditional
// where the adapter consulted a switch. IT DIES WITH THE ORDERS CONVERSION:
// when the calculations read the new names, delete this and let
// getPricingSpots return rows untouched.
import type { SpotPriceWire } from "@dorado/contracts";

type Row = Record<string, unknown>;

const NAMES: Record<string, string> = { name: "type", ask: "ask_spot", bid: "bid_spot" };

function down(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) out[NAMES[key] ?? key] = value;
  return out;
}

export function toLegacy(data: Row[] | Row | null | undefined): SpotPriceWire[] | SpotPriceWire {
  if (Array.isArray(data)) return data.map(down) as SpotPriceWire[];
  return down(data ?? {}) as SpotPriceWire;
}
