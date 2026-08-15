import { z } from "zod/v4";
import { RatesRow } from "../generated/tables.js";

// GET /rates. The query joins metals and returns the metal's name in place of
// its id, and drops the audit columns.
export const RateWire = RatesRow.omit({
  metal_id: true,
  created_at: true,
  updated_at: true,
  created_by: true,
  updated_by: true,
}).extend({
  metal: z.string(),
});
export type RateWire = z.infer<typeof RateWire>;
