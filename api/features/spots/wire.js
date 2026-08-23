// A spot quote is a metal and its live price. The new schema keeps them in two
// tables - metals.metals for the identity, spots.spots for the quote - but the
// row is keyed by the metal and there is exactly one quote per metal, so the
// response stays flat.
//
// That is the line between this and suppliers/carriers: an organization exists
// independently and can be a refiner or a carrier, so it stays its own object.
// A spot quote has no existence apart from the metal it prices, and the id
// returned here IS the metal's id. One thing to the caller, so one flat object.
//
//   SPOTS_WIRE=legacy  (default) type / ask_spot / bid_spot
//   SPOTS_WIRE=next              name / ask / bid
import { makeWireAdapter } from "#shared/wire/rename.js";

export const { toWire, fromWire, toLegacy, fromLegacy, activeShape } = makeWireAdapter({
  env: "SPOTS_WIRE",
  names: { name: "type", ask: "ask_spot", bid: "bid_spot" },
});
