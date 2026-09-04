import { z } from "zod/v4";
import { Metal } from "../metals/metals.js";
import { Rate } from "../rates/rates.js";

// computed: no table backs these. The rates PAGE - a card per metal, a column
// per volume band, a percentage per material - was assembled in the browser
// from the flat `rates.rates` list: group by metal, dedupe bands by
// (min, max, unit), format "1-10 oz" / "50+ oz", pad to four columns, sort,
// then pick the best band per metal for the landing strip. None of that is a
// column, and all of it decides what a customer is told we pay.
//
// `label` and `key` are the two genuinely new values. `label` is the band as
// a customer reads it; `key` is the band's identity across metals, so the
// same volume band lines up column-wise on every card.

// ONE VOLUME BAND. The four columns are picks of the row; the two additions
// are the ones above.
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

// ONE METAL'S CARD. `top_pct` is the highest percentage any of its bands pays,
// either material - the number the landing strip prints as "up to".
export const RateTier = z.object({
  metal: Metal.shape.name,
  unit: z.string(),
  bands: z.array(RateBand),
  top_pct: z.number().nullable(),
});
export type RateTier = z.infer<typeof RateTier>;
