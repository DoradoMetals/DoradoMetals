import { z } from "zod/v4";
import { MetalsRow } from "../generated/exchange.js";

// What the repos return: the new schema's names. metals.metals calls it `name`
// where exchange.metals called it `type`, and spots.spots calls the quote
// columns `ask` and `bid` rather than `ask_spot` and `bid_spot`.
//
// Flat, unlike suppliers and carriers, because a spot quote has no existence
// apart from the metal it prices - the id here IS the metal's id. An
// organization exists independently and can be a refiner or a carrier, so that
// one stays its own object; this one does not.
export const SpotPriceWireNext = MetalsRow.omit({
  scrap_percentage: true,
  bullion_percentage: true,
  type: true,
  ask_spot: true,
  bid_spot: true,
}).extend({
  name: z.string(),
  ask: z.number().nullable(),
  bid: z.number().nullable(),
});
export type SpotPriceWireNext = z.infer<typeof SpotPriceWireNext>;

// What the frontend still reads. Produced by features/spots/wire.js behind
// SPOTS_WIRE=legacy, and derived from the next shape so the two cannot drift.
export const SpotPriceWire = SpotPriceWireNext.omit({
  name: true,
  ask: true,
  bid: true,
}).extend({
  type: z.string(),
  ask_spot: z.number().nullable(),
  bid_spot: z.number().nullable(),
});
export type SpotPriceWire = z.infer<typeof SpotPriceWire>;
