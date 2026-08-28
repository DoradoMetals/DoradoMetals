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
export const SpotPrice = MetalsRow.omit({
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
export type SpotPrice = z.infer<typeof SpotPrice>;

// The legacy SpotPriceWire shape (type / ask_spot / bid_spot) lived here until
// 2026-08-28, derived from this one by the three renames back. Spots converted
// 2026-08-27 and its adapter died then; the schema itself retired when the
// orders wire conversion took the last legacy vocabulary with it. This shape
// carried the -WireNext suffix until the same day: one shape, one name.
