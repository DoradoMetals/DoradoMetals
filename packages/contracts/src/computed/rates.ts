import { z } from "zod/v4";
import { Rate } from "../rates/rates.js";

export const RateBand = Rate.pick({
  min_qty: true,
  max_qty: true,
  scrap_pct: true,
  bullion_pct: true,
}).extend({
  key: z.string(),
  label: z.string(),
});
export type RateBand = z.infer<typeof RateBand>;

export const RateTier = z.object({
  metal_id: Rate.shape.metal_id,
  unit: z.string(),
  bands: z.array(RateBand),
  top_pct: z.number().nullable(),
});
export type RateTier = z.infer<typeof RateTier>;
