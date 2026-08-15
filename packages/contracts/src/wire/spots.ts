import { z } from "zod/v4";
import { MetalsRow } from "../generated/tables.js";

// GET /spots/spot_prices. The endpoint selects the quote columns and leaves the
// tiering percentages behind, so this is the row minus those two.
export const SpotPriceWire = MetalsRow.omit({
  scrap_percentage: true,
  bullion_percentage: true,
});
export type SpotPriceWire = z.infer<typeof SpotPriceWire>;
